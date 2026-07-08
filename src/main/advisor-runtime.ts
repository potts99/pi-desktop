import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
	AdvisorConfig,
	MetricsAdvisorAction,
	MetricsAdvisorSeverity,
	SessionStatsInfo,
} from "../shared/types.ts";
import { parseAdvisory } from "../shared/view-model.ts";

export type AdvisorSeverity = MetricsAdvisorSeverity;

export interface AdvisorState {
	client: AdvisorClient | null;
	spawnedFor: string | null;
	cursor: number;
	recentAdvice: string[];
	consecutive: number;
	reviewing: boolean;
}

export interface AdvisorClient {
	start(): Promise<void>;
	stop(): Promise<void>;
	onEvent(listener: (event: AgentEvent) => void): () => void;
	prompt(message: string): Promise<void>;
	getLastAssistantText(): Promise<string | null>;
	getSessionStats?(): Promise<SessionStatsInfo>;
}

export interface WorkerClient {
	getEntries(): Promise<{ entries: SessionEntry[] }>;
	getState(): Promise<{ isStreaming?: boolean }>;
	prompt(message: string): Promise<void>;
	steer(message: string): Promise<void>;
	followUp(message: string): Promise<void>;
}

export interface AdvisorRuntimeOptions {
	state: AdvisorState;
	config: AdvisorConfig;
	worker: WorkerClient;
	cwd: string;
	cliPath: string;
	env: Record<string, string>;
	createClient: (options: {
		cliPath: string;
		cwd?: string;
		args: string[];
		env: Record<string, string>;
	}) => AdvisorClient;
	onReviewing?: (reviewing: boolean) => void;
	onReviewMetric?: (metric: {
		startedAtMs: number;
		endedAtMs: number;
		model: { provider: string; id: string };
		thinkingLevel: AdvisorConfig["thinkingLevel"];
		severity: AdvisorSeverity;
		action: MetricsAdvisorAction;
		status: "completed" | "error";
		beforeStats: SessionStatsInfo | null;
		afterStats: SessionStatsInfo | null;
	}) => void | Promise<void>;
}

export function createAdvisorState(): AdvisorState {
	return {
		client: null,
		spawnedFor: null,
		cursor: 0,
		recentAdvice: [],
		consecutive: 0,
		reviewing: false,
	};
}

export function noteUserTurn(state: AdvisorState): void {
	state.consecutive = 0;
}

export async function resetAdvisor(state: AdvisorState): Promise<void> {
	const client = state.client;
	state.client = null;
	state.spawnedFor = null;
	state.cursor = 0;
	state.recentAdvice = [];
	state.consecutive = 0;
	state.reviewing = false;
	await client?.stop().catch(() => {});
}

export async function reviewAdvisor(
	options: AdvisorRuntimeOptions,
): Promise<void> {
	const { state, config, worker } = options;
	if (state.reviewing) return;
	if (!config.enabled || !config.model) {
		await syncCursor(state, worker);
		return;
	}

	state.reviewing = true;
	let signalledReviewing = false;
	const startedAtMs = Date.now();
	let advisorClient: AdvisorClient | null = null;
	let beforeStats: SessionStatsInfo | null = null;
	let afterStats: SessionStatsInfo | null = null;
	let severity: AdvisorSeverity = "none";
	let action: MetricsAdvisorAction = "none";
	let reviewStarted = false;
	let status: "completed" | "error" = "completed";
	try {
		const { entries } = await worker.getEntries();
		const delta = entries.slice(state.cursor);
		state.cursor = entries.length;
		const prompt = formatEntriesForAdvisor(delta);
		if (!prompt) return;

		options.onReviewing?.(true);
		signalledReviewing = true;

		advisorClient = await getAdvisorClient(options);
		reviewStarted = true;
		beforeStats = await safeAdvisorStats(advisorClient);
		const idle = waitForIdle(advisorClient);
		await advisorClient.prompt(prompt);
		await idle;
		afterStats = await safeAdvisorStats(advisorClient);

		const parsed = parseAdvisorResponse(
			await advisorClient.getLastAssistantText(),
		);
		severity = parsed.severity;
		if (parsed.severity === "none") return;

		const normalizedNote = normalizeAdvice(parsed.note);
		if (!normalizedNote || state.recentAdvice.includes(normalizedNote)) return;
		state.recentAdvice = [...state.recentAdvice.slice(-63), normalizedNote];

		const wrappedAdvice = wrapAdvisory(parsed.severity, parsed.note);
		const capReached = state.consecutive >= config.maxConsecutive;
		if (parsed.severity === "nit" || capReached) {
			action = "followUp";
			await worker.followUp(wrappedAdvice);
			return;
		}

		const workerState = await worker
			.getState()
			.catch(() => ({ isStreaming: false }));
		if (workerState.isStreaming) {
			action = "steer";
			await worker.steer(wrappedAdvice);
		} else {
			action = "prompt";
			await worker.prompt(wrappedAdvice);
		}
		state.consecutive += 1;
	} catch (error) {
		status = "error";
		throw error;
	} finally {
		if (reviewStarted && config.model) {
			void options.onReviewMetric?.({
				startedAtMs,
				endedAtMs: Date.now(),
				model: config.model,
				thinkingLevel: config.thinkingLevel,
				severity,
				action,
				status,
				beforeStats,
				afterStats,
			});
		}
		state.reviewing = false;
		if (signalledReviewing) options.onReviewing?.(false);
	}
}

async function safeAdvisorStats(
	client: AdvisorClient,
): Promise<SessionStatsInfo | null> {
	if (!client.getSessionStats) return null;
	return client.getSessionStats().catch(() => null);
}

async function syncCursor(
	state: AdvisorState,
	worker: WorkerClient,
): Promise<void> {
	const { entries } = await worker
		.getEntries()
		.catch(() => ({ entries: [] as SessionEntry[] }));
	state.cursor = entries.length;
}

async function getAdvisorClient(
	options: AdvisorRuntimeOptions,
): Promise<AdvisorClient> {
	const { state, config } = options;
	const modelSelector = `${config.model?.provider}/${config.model?.id}:${config.thinkingLevel}`;
	if (state.client && state.spawnedFor === modelSelector) return state.client;

	await state.client?.stop().catch(() => {});
	const client = options.createClient({
		cliPath: options.cliPath,
		cwd: options.cwd || undefined,
		args: [
			"--no-session",
			"--model",
			modelSelector,
			"--tools",
			"read,grep,glob",
			"--append-system-prompt",
			advisorSystemPrompt(config.instructions),
		],
		env: options.env,
	});
	await client.start();
	state.client = client;
	state.spawnedFor = modelSelector;
	return client;
}

function waitForIdle(client: AdvisorClient): Promise<void> {
	return new Promise((resolve) => {
		const unsubscribe = client.onEvent((event) => {
			if ((event as { type?: string }).type !== "agent_end") return;
			unsubscribe();
			resolve();
		});
	});
}

export function parseAdvisorResponse(text: string | null): {
	severity: AdvisorSeverity;
	note: string;
} {
	const trimmedText = text?.trim() ?? "";
	const match = /^SEVERITY:\s*(none|nit|concern|blocker)\s*\n?/i.exec(
		trimmedText,
	);
	if (!match) return { severity: "none", note: "" };
	const severity = match[1].toLowerCase() as AdvisorSeverity;
	const note = trimmedText.slice(match[0].length).trim();
	if (severity === "none" || !note) return { severity: "none", note: "" };
	return { severity, note };
}

export function wrapAdvisory(
	severity: Exclude<AdvisorSeverity, "none">,
	note: string,
): string {
	return `<advisory severity="${severity}" guidance="weigh, don't blindly obey">${escapeXml(note)}</advisory>`;
}

export function formatEntriesForAdvisor(entries: SessionEntry[]): string {
	return entries
		.map(entryToAdvisorText)
		.filter((text) => text.length > 0)
		.join("\n\n");
}

function entryToAdvisorText(entry: SessionEntry): string {
	if (entry.type !== "message") return "";
	const text = messageText(entry.message).trim();
	if (!text || parseAdvisory(text)) return "";
	return `## ${entry.message.role}\n${text}`;
}

function messageText(message: AgentMessage): string {
	if (!("content" in message)) return "";
	if (typeof message.content === "string") return message.content;
	return message.content
		.map((content) => {
			if ("text" in content) return content.text;
			if (content.type === "thinking") return content.thinking;
			if (content.type === "toolCall")
				return `${content.name}\n${JSON.stringify(content.arguments, null, 2)}`;
			return "";
		})
		.join("\n")
		.trim();
}

function normalizeAdvice(note: string): string {
	return note.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function advisorSystemPrompt(instructions: string): string {
	const base = `You are the Advisor: a senior reviewer watching a worker agent solve a task in this workspace. You have read-only tools (read, grep, glob). After each worker turn you receive the new transcript delta. Investigate if needed, then reply with EXACTLY:\nSEVERITY: none|nit|concern|blocker\n<one concise note, or empty for none>\n\nnone = no concerns (leave note empty). nit = minor/non-blocking.\nconcern = likely wrong direction, missing constraint, hallucinated API.\nblocker = continuing wastes work or produces broken output.\nStay silent (none) unless you have something concrete. Never repeat prior advice.`;
	const trimmedInstructions = instructions.trim();
	return trimmedInstructions
		? `${base}\n\nAdditional project-specific review priorities:\n${trimmedInstructions}`
		: base;
}
