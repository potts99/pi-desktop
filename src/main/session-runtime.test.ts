import { describe, expect, it, vi } from "vitest";

const rpcClients: MockRpcClient[] = [];

class MockRpcClient {
	process = {
		stdin: {
			destroyed: false,
			writable: true,
			write: vi.fn(),
		},
	};
	listeners: Array<(event: unknown) => void> = [];

	constructor() {
		rpcClients.push(this);
	}

	async start() {}
	async stop() {}
	onEvent(listener: (event: unknown) => void) {
		this.listeners.push(listener);
		return () => {};
	}
	async getState() {
		return {
			thinkingLevel: "medium",
			isStreaming: false,
			sessionFile: "/s/x.jsonl",
		};
	}
	async getEntries() {
		return { entries: [] };
	}
	emit(event: unknown) {
		for (const listener of this.listeners) listener(event);
	}
}

vi.mock("@earendil-works/pi-coding-agent", () => ({
	AuthStorage: {
		create: vi.fn((authPath?: string) => ({ authPath })),
	},
	ModelRegistry: {
		create: vi.fn((authStorage: { authPath?: string }) => ({
			getAvailable: () =>
				authStorage.authPath?.endsWith("auth.json")
					? [{ provider: "deepseek", id: "deepseek-chat" }]
			: [{ provider: "meridian", id: "claude-opus-4-8" }],
		})),
	},
	RpcClient: MockRpcClient,
}));

vi.mock("./settings-store.ts", () => ({
	getSettings: vi.fn(async () => ({})),
}));

vi.mock("./advisor-store.ts", () => ({
	getAdvisorConfig: vi.fn(async () => ({})),
}));

vi.mock("./advisor-runtime.ts", () => ({
	createAdvisorState: vi.fn(() => ({})),
	noteUserTurn: vi.fn(),
	resetAdvisor: vi.fn(),
	reviewAdvisor: vi.fn(),
}));

const { getAllModelChoices, openSession, respondToUiRequest } = await import(
	"./session-runtime.ts"
);

describe("getAllModelChoices", () => {
	it("uses auth.json for registry-backed providers", async () => {
		await expect(getAllModelChoices()).resolves.toEqual([
			{ provider: "deepseek", id: "deepseek-chat" },
		]);
	});
});

describe("extension UI requests", () => {
	it("emits UI requests and writes responses back to RPC stdin", async () => {
		rpcClients.length = 0;
		const emit = vi.fn();
		const { sessionKey } = await openSession({ newIn: "/repo" }, emit);
		rpcClients[0].emit({
			type: "extension_ui_request",
			id: "ui1",
			method: "select",
			title: "Pick one",
			options: ["A", "B"],
		});

		expect(emit).toHaveBeenCalledWith(sessionKey, {
			kind: "uiRequest",
			request: {
				id: "ui1",
				method: "select",
				title: "Pick one",
				options: ["A", "B"],
				timeout: undefined,
			},
		});

		await respondToUiRequest(sessionKey, { id: "ui1", value: "B" });

		expect(rpcClients[0].process.stdin.write).toHaveBeenCalledWith(
			'{"type":"extension_ui_response","id":"ui1","value":"B"}\n',
		);
	});
});
