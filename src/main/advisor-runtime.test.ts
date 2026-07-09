import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AdvisorConfig } from "../shared/types.ts";
import {
	createAdvisorState,
	formatEntriesForAdvisor,
	noteUserTurn,
	parseAdvisorResponse,
	resetAdvisor,
	reviewAdvisor,
	wrapAdvisory,
	type AdvisorClient,
	type AdvisorState,
	type WorkerClient,
} from "./advisor-runtime.ts";

function entry(role: "user" | "assistant", text: string): SessionEntry {
	return {
		type: "message",
		message: { role, content: text },
		id: Math.random().toString(36),
	} as unknown as SessionEntry;
}

function config(over: Partial<AdvisorConfig> = {}): AdvisorConfig {
	return {
		enabled: true,
		model: { provider: "test", id: "advisor" },
		thinkingLevel: "medium",
		instructions: "",
		maxConsecutive: 3,
		...over,
	};
}

class FakeAdvisor implements AdvisorClient {
	stopped = false;
	prompts: string[] = [];
	stats = {
		sessionId: "advisor",
		userMessages: 0,
		assistantMessages: 0,
		totalMessages: 0,
		tokens: { input: 0, output: 0, total: 0 },
		cost: 0,
	};
	private listeners: Array<(event: AgentEvent) => void> = [];

	constructor(public response: string | null) {}

	async start(): Promise<void> {}
	async stop(): Promise<void> {
		this.stopped = true;
	}
	onEvent(listener: (event: AgentEvent) => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((current) => current !== listener);
		};
	}
	async prompt(message: string): Promise<void> {
		this.prompts.push(message);
		setTimeout(
			() =>
				this.listeners.forEach((listener) =>
					listener({ type: "agent_end" } as AgentEvent),
				),
			0,
		);
	}
	async getLastAssistantText(): Promise<string | null> {
		return this.response;
	}
	async getSessionStats() {
		return this.stats;
	}
}

class FakeWorker implements WorkerClient {
	deliveries: Array<{
		method: "prompt" | "steer" | "followUp";
		message: string;
	}> = [];
	streaming = false;

	constructor(public entries: SessionEntry[] = []) {}

	async getEntries(): Promise<{ entries: SessionEntry[] }> {
		return { entries: this.entries };
	}
	async getState(): Promise<{ isStreaming?: boolean }> {
		return { isStreaming: this.streaming };
	}
	async prompt(message: string): Promise<void> {
		this.deliveries.push({ method: "prompt", message });
	}
	async steer(message: string): Promise<void> {
		this.deliveries.push({ method: "steer", message });
	}
	async followUp(message: string): Promise<void> {
		this.deliveries.push({ method: "followUp", message });
	}
}

async function review(
	state: AdvisorState,
	worker: FakeWorker,
	advisor: FakeAdvisor,
	advisorConfig: AdvisorConfig = config(),
): Promise<void> {
	await reviewAdvisor({
		state,
		config: advisorConfig,
		worker,
		cwd: "/tmp",
		cliPath: "/tmp/cli.js",
		env: {},
		createClient: () => advisor,
	});
}

describe("advisor-runtime", () => {
	it("routes severities", async () => {
		const worker = new FakeWorker([entry("assistant", "done")]);
		await review(
			createAdvisorState(),
			worker,
			new FakeAdvisor("SEVERITY: nit\nSmall cleanup"),
		);
		expect(worker.deliveries[0].method).toBe("followUp");

		worker.entries.push(entry("assistant", "again"));
		worker.streaming = true;
		await review(
			createAdvisorState(),
			worker,
			new FakeAdvisor("SEVERITY: concern\nWrong API"),
		);
		expect(worker.deliveries[1].method).toBe("steer");

		worker.streaming = false;
		await review(
			createAdvisorState(),
			worker,
			new FakeAdvisor("SEVERITY: blocker\nBroken"),
		);
		expect(worker.deliveries[2].method).toBe("prompt");
	});

	it("does not run when disabled or missing a model", async () => {
		const worker = new FakeWorker([entry("assistant", "done")]);
		const advisor = new FakeAdvisor("SEVERITY: concern\nStop");

		await review(
			createAdvisorState(),
			worker,
			advisor,
			config({ enabled: false }),
		);
		await review(
			createAdvisorState(),
			worker,
			advisor,
			config({ model: null }),
		);

		expect(advisor.prompts).toEqual([]);
		expect(worker.deliveries).toEqual([]);
	});

	it("signals reviewing only around real review work", async () => {
		const events: boolean[] = [];
		const onReviewing = (reviewing: boolean) => events.push(reviewing);
		const state = createAdvisorState();
		const worker = new FakeWorker([entry("assistant", "done")]);
		state.cursor = worker.entries.length;

		await reviewAdvisor({
			state,
			config: config(),
			worker,
			cwd: "/tmp",
			cliPath: "/tmp/cli.js",
			env: {},
			createClient: () => new FakeAdvisor("SEVERITY: none"),
			onReviewing,
		});
		expect(events).toEqual([]);

		worker.entries.push(entry("assistant", "new work"));
		await reviewAdvisor({
			state,
			config: config(),
			worker,
			cwd: "/tmp",
			cliPath: "/tmp/cli.js",
			env: {},
			createClient: () => new FakeAdvisor("SEVERITY: nit\nTidy up"),
			onReviewing,
		});
		expect(events).toEqual([true, false]);
	});

	it("reports advisor review metrics with severity and action", async () => {
		const state = createAdvisorState();
		const worker = new FakeWorker([entry("assistant", "done")]);
		const advisor = new FakeAdvisor("SEVERITY: blocker\nStop");
		const metrics: unknown[] = [];

		await reviewAdvisor({
			state,
			config: config(),
			worker,
			cwd: "/tmp",
			cliPath: "/tmp/cli.js",
			env: {},
			createClient: () => advisor,
			onReviewMetric: (metric) => {
				metrics.push(metric);
			},
		});

		expect(metrics).toHaveLength(1);
		expect(metrics[0]).toMatchObject({
			model: { provider: "test", id: "advisor" },
			thinkingLevel: "medium",
			severity: "blocker",
			action: "prompt",
			status: "completed",
		});
	});

	it("ignores none, empty, and malformed responses", async () => {
		const worker = new FakeWorker([entry("assistant", "done")]);
		await review(
			createAdvisorState(),
			worker,
			new FakeAdvisor("SEVERITY: none"),
		);
		await review(
			createAdvisorState(),
			worker,
			new FakeAdvisor("SEVERITY: concern\n"),
		);
		await review(createAdvisorState(), worker, new FakeAdvisor("hello"));
		expect(worker.deliveries).toEqual([]);
		expect(parseAdvisorResponse("nonsense")).toEqual({
			severity: "none",
			note: "",
		});
	});

	it("dedupes normalized advice", async () => {
		const state = createAdvisorState();
		const worker = new FakeWorker([entry("assistant", "one")]);
		await review(
			state,
			worker,
			new FakeAdvisor("SEVERITY: concern\nUse tests"),
		);
		worker.entries.push(entry("assistant", "two"));
		await review(
			state,
			worker,
			new FakeAdvisor("SEVERITY: concern\n  use   tests "),
		);
		expect(worker.deliveries).toHaveLength(1);
	});

	it("caps consecutive interrupting advice until user input", async () => {
		const state = createAdvisorState();
		const worker = new FakeWorker([entry("assistant", "one")]);
		const advisor = new FakeAdvisor("SEVERITY: concern\nOne");
		await review(state, worker, advisor, config({ maxConsecutive: 1 }));
		worker.entries.push(entry("assistant", "two"));
		advisor.response = "SEVERITY: blocker\nTwo";
		await review(state, worker, advisor, config({ maxConsecutive: 1 }));
		expect(worker.deliveries.map((delivery) => delivery.method)).toEqual([
			"prompt",
			"followUp",
		]);

		noteUserTurn(state);
		worker.entries.push(entry("assistant", "three"));
		advisor.response = "SEVERITY: concern\nThree";
		await review(state, worker, advisor, config({ maxConsecutive: 1 }));
		expect(worker.deliveries[2].method).toBe("prompt");
	});

	it("tracks cursor and filters advisory messages", async () => {
		const advisory = wrapAdvisory("concern", "Already said");
		expect(
			formatEntriesForAdvisor([
				entry("user", advisory),
				entry("assistant", "Fresh"),
			]),
		).toBe("## assistant\nFresh");

		const state = createAdvisorState();
		const worker = new FakeWorker([entry("assistant", "one")]);
		const advisor = new FakeAdvisor("SEVERITY: nit\nFirst");
		await review(state, worker, advisor);
		worker.entries.push(entry("assistant", "two"));
		await review(state, worker, new FakeAdvisor("SEVERITY: nit\nSecond"));
		expect(advisor.prompts[0]).toBe("## assistant\none");
	});

	it("guards re-entrant reviews", async () => {
		const state = createAdvisorState();
		state.reviewing = true;
		const worker = new FakeWorker([entry("assistant", "done")]);
		await review(state, worker, new FakeAdvisor("SEVERITY: nit\nNote"));
		expect(worker.deliveries).toEqual([]);
	});

	it("escapes advisory XML", () => {
		expect(wrapAdvisory("blocker", 'Use <x> & "quotes"')).toContain(
			"Use &lt;x&gt; &amp; &quot;quotes&quot;",
		);
	});

	it("resets advisor state", async () => {
		const state = createAdvisorState();
		const advisor = new FakeAdvisor(null);
		state.client = advisor;
		state.spawnedFor = "x";
		state.cursor = 10;
		state.recentAdvice = ["note"];
		state.consecutive = 2;
		state.reviewing = true;
		await resetAdvisor(state);
		expect(advisor.stopped).toBe(true);
		expect(state).toEqual(createAdvisorState());
	});
});
