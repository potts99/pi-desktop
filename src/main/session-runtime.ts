import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	access,
	mkdir,
	readFile,
	readdir,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import {
	RpcClient,
	ModelRegistry,
	AuthStorage,
} from "@earendil-works/pi-coding-agent";
import { getSettings } from "./settings-store.ts";
import { getAdvisorConfig } from "./advisor-store.ts";
import {
	createAdvisorState,
	noteUserTurn,
	resetAdvisor,
	reviewAdvisor,
	type AdvisorState,
} from "./advisor-runtime.ts";
import {
	appendMetricRecord,
	advisorMetricRecord,
	statsLike,
	workerMetricRecord,
	type MetricStatsLike,
} from "./metrics-store.ts";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
	AgentMode,
	ModelChoice,
	SessionUiRequest,
	SessionUiResponse,
	SessionEvent,
	TranscriptMessage,
	Block,
	SessionState,
	ThinkingLevel,
	SessionReplacement,
} from "../shared/types.ts";

// The package's "exports" only defines an ESM "import" condition, so resolve
// via import.meta.resolve (ESM) — not require.resolve — then derive cli.js.
// In packaged Electron, the app code runs from app.asar, but the spawned Node
// process cannot execute files from that virtual archive. electron-builder
// unpacks node_modules beside it, so point the subprocess at the real path.
const codingAgentUrl =
	(
		import.meta as ImportMeta & { resolve?: (specifier: string) => string }
	).resolve?.("@earendil-works/pi-coding-agent") ??
	new URL(
		"../../node_modules/@earendil-works/pi-coding-agent/dist/index.js",
		import.meta.url,
	).href;
const codingAgentPath = codingAgentUrl.startsWith("file:")
	? fileURLToPath(codingAgentUrl)
	: codingAgentUrl;
const resolvedCliPath = join(dirname(codingAgentPath), "cli.js");
const cliPath = resolvedCliPath.replace("/app.asar/", "/app.asar.unpacked/");

interface Entry {
	client: RpcClient;
	cwd: string;
	args: string[];
	sessionPath?: string;
	mode: AgentMode;
	advisor: AdvisorState;
	emit: (sessionKey: string, ev: SessionEvent) => void;
	workingStartedAt: number | null;
	activeMetricRun?: {
		id: string;
		startedAtMs: number;
		beforeStats: MetricStatsLike;
		model: ModelChoice | null;
		thinkingLevel: ThinkingLevel;
		mode: AgentMode;
		requestMode: "prompt" | "steer" | "followUp";
		sessionPath?: string;
		sessionId?: string;
	};
}
const pool = new Map<string, Entry>();
let counter = 0;

const defaultQueue = { steering: [], followUp: [] };
const defaultMode: AgentMode = "normal";
const sharedModelsPath = join(homedir(), ".pi", "agent", "models.json");
const workingStartsPath = join(
	homedir(),
	".pi",
	"agent",
	"pi-desktop-session-work.json",
);
let cachedAgentEnv: Record<string, string> | null = null;
// ponytail: cache ModelRegistry models to avoid re-reading models.json on every fetch.
// Ceiling: a provider/model added mid-session won't appear until app restart.
let cachedRegistryModels: ModelChoice[] | null = null;

// ponytail: pre-warm agent env at module load so first session open doesn't block on nvm scan.
// Must run AFTER the `let cachedAgentEnv` declaration above — accessing it before
// initialization is a temporal-dead-zone error that the .catch() would silently swallow.
agentEnv().catch(() => {});

interface SharedModelsFile {
	providers?: Record<string, { models?: Array<{ id?: unknown }> }>;
}

function stringEnv(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
}

async function nodePathDirs(): Promise<string[]> {
	const home = homedir();
	const dirs = [
		dirname(process.execPath),
		join(home, ".nvm", "current", "bin"),
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
	];
	try {
		const versionsDir = join(home, ".nvm", "versions", "node");
		const versions = await readdir(versionsDir, { withFileTypes: true });
		dirs.push(
			...versions
				.filter((entry) => entry.isDirectory())
				.map((entry) => join(versionsDir, entry.name, "bin")),
		);
	} catch {
		/* nvm may not be installed */
	}
	return dirs;
}

async function agentEnv(): Promise<Record<string, string>> {
	if (cachedAgentEnv) return cachedAgentEnv;
	const existingPath = process.env.PATH ?? "";
	const dirs = [...(await nodePathDirs()), ...existingPath.split(":")].filter(
		Boolean,
	);
	const uniqueDirs = [...new Set(dirs)];
	cachedAgentEnv = { ...stringEnv(), PATH: uniqueDirs.join(":") };
	return cachedAgentEnv;
}

function toBlocks(msg: AgentMessage, id?: string): TranscriptMessage | null {
	if (msg.role === "user") {
		const text =
			typeof msg.content === "string"
				? msg.content
				: msg.content.map((c) => ("text" in c ? c.text : "")).join("");
		return { id, role: "user", blocks: [{ kind: "text", text }] };
	}
	if (msg.role === "assistant") {
		const blocks: Block[] = [];
		for (const c of msg.content) {
			if (c.type === "text") blocks.push({ kind: "text", text: c.text });
			else if (c.type === "thinking")
				blocks.push({ kind: "thinking", text: c.thinking });
			else if (c.type === "toolCall")
				blocks.push({
					kind: "toolCall",
					id: c.id,
					name: c.name,
					args: c.arguments,
				});
		}
		// Surface a failed turn's error inline in the transcript flow (like a response),
		// not just as a detached banner. Aborts are excluded so intentional stops stay quiet.
		if (msg.stopReason === "error" && msg.errorMessage)
			blocks.push({ kind: "error", text: msg.errorMessage });
		return { id, role: "assistant", blocks };
	}
	if (msg.role === "toolResult") {
		const text = msg.content
			.map((c) => ("text" in c ? c.text : "[non-text]"))
			.join("");
		const diff = (msg.details as { diff?: string } | undefined)?.diff;
		return {
			id,
			role: "tool",
			blocks: [
				{
					kind: "toolResult",
					toolCallId: msg.toolCallId,
					toolName: msg.toolName,
					text,
					isError: msg.isError,
					diff,
				},
			],
		};
	}
	return null;
}

function entryToMessage(entry: SessionEntry): TranscriptMessage | null {
	if (entry.type !== "message") return null;
	return toBlocks(entry.message, entry.id);
}

function textOf(message: TranscriptMessage): string {
	return message.blocks
		.map((b) => {
			if (b.kind === "text" || b.kind === "thinking") return b.text;
			if (b.kind === "toolResult") return b.text;
			if (b.kind === "toolCall")
				return `${b.name}\n${JSON.stringify(b.args, null, 2)}`;
			return "";
		})
		.join("\n")
		.trim();
}

function errorMessageOf(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (value instanceof Error) return value.message;
	if (!value || typeof value !== "object") return null;

	const record = value as Record<string, unknown>;
	for (const key of ["errorMessage", "message", "finalError"]) {
		const message = errorMessageOf(record[key]);
		if (message) return message;
	}
	return errorMessageOf(record.error);
}

function normalizeUiRequest(value: unknown): SessionUiRequest | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (record.type !== "extension_ui_request") return null;
	if (typeof record.id !== "string" || typeof record.method !== "string")
		return null;

	const timeout =
		typeof record.timeout === "number" && Number.isFinite(record.timeout)
			? record.timeout
			: undefined;
	const title = typeof record.title === "string" ? record.title : "";
	switch (record.method) {
		case "select":
			return {
				id: record.id,
				method: "select",
				title,
				options: Array.isArray(record.options)
					? record.options.filter((o): o is string => typeof o === "string")
					: [],
				timeout,
			};
		case "confirm":
			return {
				id: record.id,
				method: "confirm",
				title,
				message: typeof record.message === "string" ? record.message : "",
				timeout,
			};
		case "input":
			return {
				id: record.id,
				method: "input",
				title,
				placeholder:
					typeof record.placeholder === "string"
						? record.placeholder
						: undefined,
				timeout,
			};
		case "editor":
			return {
				id: record.id,
				method: "editor",
				title,
				prefill:
					typeof record.prefill === "string" ? record.prefill : undefined,
			};
		case "notify":
			return {
				id: record.id,
				method: "notify",
				message: typeof record.message === "string" ? record.message : "",
				notifyType:
					record.notifyType === "warning" || record.notifyType === "error"
						? record.notifyType
						: record.notifyType === "info"
							? "info"
							: undefined,
			};
		case "setStatus":
			return {
				id: record.id,
				method: "setStatus",
				statusKey:
					typeof record.statusKey === "string" ? record.statusKey : "status",
				statusText:
					typeof record.statusText === "string" ? record.statusText : undefined,
			};
		case "setWidget":
			return {
				id: record.id,
				method: "setWidget",
				widgetKey:
					typeof record.widgetKey === "string" ? record.widgetKey : "widget",
				widgetLines: Array.isArray(record.widgetLines)
					? record.widgetLines.filter(
							(line): line is string => typeof line === "string",
						)
					: undefined,
				widgetPlacement:
					record.widgetPlacement === "aboveEditor" ||
					record.widgetPlacement === "belowEditor"
						? record.widgetPlacement
						: undefined,
			};
		case "setTitle":
			return { id: record.id, method: "setTitle", title };
		case "set_editor_text":
			return {
				id: record.id,
				method: "set_editor_text",
				text: typeof record.text === "string" ? record.text : "",
			};
		default:
			return null;
	}
}

async function transcript(client: RpcClient): Promise<TranscriptMessage[]> {
	try {
		const { entries } = await client.getEntries();
		return entries
			.map(entryToMessage)
			.filter((m): m is TranscriptMessage => m !== null);
	} catch {
		return (await client.getMessages().catch(() => [] as AgentMessage[]))
			.map((m) => toBlocks(m))
			.filter((m): m is TranscriptMessage => m !== null);
	}
}

export async function sharedModelChoices(): Promise<ModelChoice[]> {
	try {
		const cfg = JSON.parse(
			await readFile(sharedModelsPath, "utf-8"),
		) as SharedModelsFile;
		return Object.entries(cfg.providers ?? {}).flatMap(([provider, value]) =>
			(value.models ?? [])
				.filter(
					(model): model is { id: string } =>
						typeof model.id === "string" && model.id.length > 0,
				)
				.map((model) => ({ provider, id: model.id })),
		);
	} catch {
		return [];
	}
}

function uniqueModels(models: ModelChoice[]): ModelChoice[] {
	const seen = new Set<string>();
	return models.filter((model) => {
		const key = `${model.provider}/${model.id}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function hydrateForkIds(
	client: RpcClient,
	message: TranscriptMessage,
): Promise<TranscriptMessage> {
	if (message.id || message.role !== "user") return message;
	const text = textOf(message);
	if (!text) return message;
	const forkMessages = await client.getForkMessages().catch(() => []);
	const match = [...forkMessages].reverse().find((m) => m.text.trim() === text);
	return match ? { ...message, id: match.entryId } : message;
}

async function reviewAfterTurn(
	sessionKey: string,
	entry: Entry,
): Promise<void> {
	try {
		await reviewAdvisor({
			state: entry.advisor,
			config: await getAdvisorConfig(),
			worker: entry.client,
			cwd: entry.cwd,
			cliPath,
			env: await agentEnv(),
			createClient: (options) => new RpcClient(options),
			onReviewing: (reviewing) =>
				entry.emit(sessionKey, { kind: "advisory", reviewing }),
			onReviewMetric: (metric) =>
				appendMetricRecord(
					advisorMetricRecord({
						id: `observed:advisor:${sessionKey}:${metric.startedAtMs}`,
						projectPath: entry.cwd || "unknown",
						sessionPath: entry.sessionPath,
						startedAtMs: metric.startedAtMs,
						endedAtMs: metric.endedAtMs,
						model: metric.model,
						thinkingLevel: metric.thinkingLevel,
						severity: metric.severity,
						action: metric.action,
						status: metric.status,
						before: statsLike(metric.beforeStats),
						after: statsLike(metric.afterStats),
					}),
				).catch((error) => {
					console.warn("Failed to write advisor metrics", error);
				}),
		});
	} catch (error) {
		entry.emit(sessionKey, {
			kind: "error",
			message: `Advisor failed: ${errorMessageOf(error) ?? String(error)}`,
		});
	}
}

function wireEvents(sessionKey: string, entry: Entry): void {
	entry.client.onEvent((ev: AgentEvent) => {
		const eventType = (ev as { type: string }).type;
		if (eventType === "extension_ui_request") {
			const request = normalizeUiRequest(ev);
			if (request) entry.emit(sessionKey, { kind: "uiRequest", request });
		} else if (eventType === "message_update") {
			const d = (
				ev as {
					assistantMessageEvent?: {
						type?: string;
						delta?: string;
						error?: unknown;
					};
				}
			).assistantMessageEvent;
			if (d?.type === "text_delta" && d.delta) {
				entry.emit(sessionKey, { kind: "assistantDelta", text: d.delta });
			} else if (d?.type === "error") {
				entry.emit(sessionKey, {
					kind: "error",
					message: errorMessageOf(d) ?? "Unknown agent error",
				});
			}
		} else if (eventType === "message_end") {
			const raw = (ev as { message: AgentMessage }).message;
			const m = toBlocks(raw);
			if (m) {
				entry.emit(sessionKey, { kind: "message", message: m });
				if (
					raw.role === "assistant" &&
					raw.stopReason === "error" &&
					raw.errorMessage
				) {
					entry.emit(sessionKey, { kind: "error", message: raw.errorMessage });
				}
				if (m.role === "user") {
					void hydrateForkIds(entry.client, m)
						.then((hydrated) => {
							if (hydrated.id && hydrated.id !== m.id)
								entry.emit(sessionKey, { kind: "message", message: hydrated });
						})
						.catch(() => {});
				}
			}
		} else if (eventType === "agent_end") {
			void finishWorkerMetricRun(sessionKey, entry, "completed");
			clearWork(entry);
			entry.emit(sessionKey, { kind: "idle" });
			void reviewAfterTurn(sessionKey, entry);
		} else if (eventType === "queue_update") {
			const q = ev as { steering?: string[]; followUp?: string[] };
			entry.emit(sessionKey, {
				kind: "queue",
				queue: { steering: q.steering ?? [], followUp: q.followUp ?? [] },
			});
		} else if (eventType === "auto_retry_start") {
			const r = ev as {
				attempt?: number;
				maxAttempts?: number;
				delayMs?: number;
				errorMessage?: string;
			};
			entry.emit(sessionKey, {
				kind: "retry",
				retry: {
					active: true,
					attempt: r.attempt,
					maxAttempts: r.maxAttempts,
					delayMs: r.delayMs,
					message: r.errorMessage,
				},
			});
		} else if (eventType === "error") {
			void finishWorkerMetricRun(sessionKey, entry, "error");
			clearWork(entry);
			entry.emit(sessionKey, {
				kind: "error",
				message: errorMessageOf(ev) ?? "Unknown agent error",
			});
		} else if (eventType === "auto_retry_end") {
			const r = ev as {
				success?: boolean;
				attempt?: number;
				finalError?: string;
			};
			entry.emit(sessionKey, {
				kind: "retry",
				retry: {
					active: false,
					attempt: r.attempt,
					message: r.success === false ? r.finalError : undefined,
				},
			});
			if (r.success === false && r.finalError) {
				void finishWorkerMetricRun(sessionKey, entry, "error");
				clearWork(entry);
				entry.emit(sessionKey, { kind: "error", message: r.finalError });
			}
		}
	});
}

async function startClient(entry: Entry, sessionKey: string): Promise<void> {
	entry.client = new RpcClient({
		cliPath,
		cwd: entry.cwd || undefined,
		args: entry.args,
		env: await agentEnv(),
	});
	await entry.client.start();
	wireEvents(sessionKey, entry);
}

async function restartEntry(sessionKey: string, entry: Entry): Promise<void> {
	await entry.client.stop().catch(() => {});
	await startClient(entry, sessionKey);
	clearWork(entry);
	entry.emit(sessionKey, {
		kind: "error",
		message: "Agent process restarted after it stopped unexpectedly.",
	});
}

function isDeadProcessError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /process exited|Client not started|stdin is not writable|Agent process error/i.test(
		message,
	);
}

async function runCommand<T>(
	sessionKey: string,
	fn: (entry: Entry) => Promise<T>,
): Promise<T> {
	const entry = pool.get(sessionKey);
	if (!entry) throw new Error("unknown session");
	try {
		return await fn(entry);
	} catch (error) {
		if (!isDeadProcessError(error)) {
			await finishWorkerMetricRun(sessionKey, entry, "error");
			clearWork(entry);
			entry.emit(sessionKey, {
				kind: "error",
				message: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
		await restartEntry(sessionKey, entry);
		return fn(entry);
	}
}

// --- Persisted working-start timestamps (survive app reload) ---

async function readWorkingStarts(): Promise<Record<string, number>> {
	try {
		const raw = JSON.parse(
			await readFile(workingStartsPath, "utf-8"),
		) as Record<string, unknown>;
		const valid: Record<string, number> = {};
		for (const [key, value] of Object.entries(raw)) {
			if (typeof value === "number" && Number.isFinite(value) && value > 0) {
				valid[key] = value;
			}
		}
		return valid;
	} catch {
		return {};
	}
}

async function writeWorkingStarts(
	starts: Record<string, number>,
): Promise<void> {
	try {
		await mkdir(dirname(workingStartsPath), { recursive: true });
		await writeFile(workingStartsPath, JSON.stringify(starts), "utf-8");
	} catch {
		/* best-effort persistence */
	}
}

async function persistWorkingStartedAt(entry: Entry): Promise<void> {
	if (!entry.sessionPath || entry.workingStartedAt === null) return;
	const starts = await readWorkingStarts();
	starts[entry.sessionPath] = entry.workingStartedAt;
	await writeWorkingStarts(starts);
}

async function clearPersistedWorkingStartedAt(entry: Entry): Promise<void> {
	if (!entry.sessionPath) return;
	const starts = await readWorkingStarts();
	if (!(entry.sessionPath in starts)) return;
	delete starts[entry.sessionPath];
	await writeWorkingStarts(starts);
}

async function state(entry: Entry): Promise<SessionState> {
	const s = await entry.client.getState();
	entry.sessionPath = s.sessionFile;
	const model = s.model
		? { provider: s.model.provider, id: s.model.id }
		: undefined;
	if (s.isStreaming) {
		if (entry.workingStartedAt === null) {
			const starts = await readWorkingStarts();
			entry.workingStartedAt =
				(s.sessionFile ? starts[s.sessionFile] : undefined) ?? null;
			if (entry.workingStartedAt === null) {
				entry.workingStartedAt = Date.now();
				await persistWorkingStartedAt(entry);
			}
		}
	} else {
		if (entry.workingStartedAt !== null) entry.workingStartedAt = null;
		await clearPersistedWorkingStartedAt(entry);
	}
	return {
		sessionPath: s.sessionFile,
		thinkingLevel: s.thinkingLevel,
		mode: entry.mode,
		isStreaming: s.isStreaming,
		queue: defaultQueue,
		model,
		workingStartedAt: entry.workingStartedAt,
	};
}

export async function openSession(
	arg: { path: string; cwd?: string } | { newIn: string },
	emit: (sessionKey: string, ev: SessionEvent) => void,
): Promise<{
	sessionKey: string;
	messages: TranscriptMessage[];
	state: SessionState;
}> {
	const cwd = "path" in arg ? arg.cwd : arg.newIn;
	const sessionArgs = "path" in arg ? ["--session", arg.path] : [];
	const isExisting = "path" in arg;
	const env = await agentEnv();
	const client = new RpcClient({ cliPath, cwd, args: sessionArgs, env });
	await client.start();

	const sessionKey = `s${++counter}`;
	const entry: Entry = {
		client,
		cwd: cwd ?? "",
		args: sessionArgs,
		sessionPath: isExisting ? arg.path : undefined,
		mode: defaultMode,
		advisor: createAdvisorState(),
		emit,
		workingStartedAt: null,
	};
	pool.set(sessionKey, entry);
	wireEvents(sessionKey, entry);

	if (isExisting) {
		// ponytail: parallelize transcript + state RPC calls — two independent round-trips
		const [history, sessionState] = await Promise.all([
			transcript(client),
			state(entry).catch(() => ({
				sessionPath: arg.path,
				thinkingLevel: "medium" as ThinkingLevel,
				mode: defaultMode,
				isStreaming: false,
				queue: defaultQueue,
				workingStartedAt: null,
			})),
		]);
		entry.advisor.cursor = history.length;
		return { sessionKey, messages: history, state: sessionState };
	}

	// New session: no history to load, just get state
	const sessionState = await state(entry).catch(() => ({
		sessionPath: undefined,
		thinkingLevel: "medium" as ThinkingLevel,
		mode: defaultMode,
		isStreaming: false,
		queue: defaultQueue,
		workingStartedAt: null,
	}));

	return { sessionKey, messages: [], state: sessionState };
}

export async function closeSession(sessionKey: string): Promise<void> {
	const e = pool.get(sessionKey);
	if (!e) return;
	pool.delete(sessionKey);
	await Promise.all([e.client.stop().catch(() => {}), resetAdvisor(e.advisor)]);
}

/** Mark a session as actively working: timestamp + persist + notify renderer. */
function startWork(sessionKey: string, entry: Entry): void {
	entry.workingStartedAt = Date.now();
	void persistWorkingStartedAt(entry);
	entry.emit(sessionKey, {
		kind: "sessionState",
		state: {
			isStreaming: true,
			workingStartedAt: entry.workingStartedAt,
		},
	});
}

async function beginWorkerMetricRun(
	sessionKey: string,
	entry: Entry,
	requestMode: "prompt" | "steer" | "followUp",
): Promise<void> {
	const startedAtMs = entry.workingStartedAt ?? Date.now();
	const [sessionState, stats] = await Promise.all([
		entry.client.getState().catch(() => null),
		entry.client.getSessionStats().catch(() => null),
	]);
	if (sessionState?.sessionFile) entry.sessionPath = sessionState.sessionFile;
	entry.activeMetricRun = {
		id: `observed:worker:${sessionKey}:${startedAtMs}:${requestMode}`,
		startedAtMs,
		beforeStats: statsLike(stats),
		model: sessionState?.model
			? { provider: sessionState.model.provider, id: sessionState.model.id }
			: null,
		thinkingLevel: sessionState?.thinkingLevel ?? "medium",
		mode: entry.mode,
		requestMode,
		sessionPath: sessionState?.sessionFile ?? entry.sessionPath,
		sessionId: stats?.sessionId,
	};
}

async function finishWorkerMetricRun(
	sessionKey: string,
	entry: Entry,
	status: "completed" | "aborted" | "error",
): Promise<void> {
	const active = entry.activeMetricRun;
	if (!active) return;
	entry.activeMetricRun = undefined;
	const endedAtMs = Date.now();
	const afterStats = await entry.client.getSessionStats().catch(() => null);
	await appendMetricRecord(
		workerMetricRecord({
			id: active.id,
			projectPath: entry.cwd || "unknown",
			sessionPath: entry.sessionPath ?? active.sessionPath,
			sessionId: active.sessionId,
			startedAtMs: active.startedAtMs,
			endedAtMs,
			model: active.model,
			thinkingLevel: active.thinkingLevel,
			mode: active.mode,
			requestMode: active.requestMode,
			status,
			before: active.beforeStats,
			after: statsLike(afterStats),
		}),
	).catch((error) => {
		console.warn("Failed to write worker metrics", error);
	});
}

/** Clear the working timestamp and its persisted entry (renderer clears on idle/error). */
function clearWork(entry: Entry): void {
	entry.workingStartedAt = null;
	void clearPersistedWorkingStartedAt(entry);
}

export async function sendPrompt(
	sessionKey: string,
	text: string,
): Promise<void> {
	await runCommand(sessionKey, async (e) => {
		noteUserTurn(e.advisor);
		startWork(sessionKey, e);
		await beginWorkerMetricRun(sessionKey, e, "prompt");
		return e.client.prompt(text);
	});
}

export async function steer(sessionKey: string, text: string): Promise<void> {
	await runCommand(sessionKey, async (e) => {
		noteUserTurn(e.advisor);
		startWork(sessionKey, e);
		await beginWorkerMetricRun(sessionKey, e, "steer");
		return e.client.steer(text);
	});
}

export async function followUp(
	sessionKey: string,
	text: string,
): Promise<void> {
	await runCommand(sessionKey, async (e) => {
		noteUserTurn(e.advisor);
		startWork(sessionKey, e);
		await beginWorkerMetricRun(sessionKey, e, "followUp");
		return e.client.followUp(text);
	});
}

export async function abortSession(sessionKey: string): Promise<void> {
	await runCommand(sessionKey, async (e) => {
		await finishWorkerMetricRun(sessionKey, e, "aborted");
		clearWork(e);
		return e.client.abort();
	});
}

export async function respondToUiRequest(
	sessionKey: string,
	response: SessionUiResponse,
): Promise<void> {
	await runCommand(sessionKey, async (e) => {
		const client = e.client as unknown as {
			process?: {
				stdin?: {
					destroyed?: boolean;
					writable?: boolean;
					write: (data: string) => boolean;
				};
			};
		};
		const stdin = client.process?.stdin;
		if (!stdin || stdin.destroyed || stdin.writable === false) {
			throw new Error("Agent process stdin is not writable");
		}
		stdin.write(
			`${JSON.stringify({ type: "extension_ui_response", ...response })}\n`,
		);
	});
}

function getRegistryModels(): ModelChoice[] {
	if (cachedRegistryModels) return cachedRegistryModels;
	const agentDir = join(homedir(), ".pi", "agent");
	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	const registry = ModelRegistry.create(
		authStorage,
		join(agentDir, "models.json"),
	);
	cachedRegistryModels = registry
		.getAvailable()
		.map((m) => ({ provider: m.provider, id: m.id }));
	return cachedRegistryModels;
}

export async function getAllModelChoices(
	sessionKey?: string,
): Promise<ModelChoice[]> {
	const models = getRegistryModels();

	if (sessionKey) {
		try {
			const runtimeModels = await runCommand(sessionKey, (e) =>
				e.client.getAvailableModels(),
			);
			const runtime = runtimeModels.map((m) => ({
				provider: m.provider,
				id: m.id,
			}));
			return uniqueModels([...models, ...runtime]);
		} catch {
			// fall through — already have ModelRegistry models
		}
	}
	return uniqueModels(models);
}

export async function getModels(sessionKey: string): Promise<ModelChoice[]> {
	const settings = await getSettings();
	const hidden = new Set(settings.hiddenModels ?? []);
	return (await getAllModelChoices(sessionKey)).filter(
		(m) => !hidden.has(`${m.provider}/${m.id}`),
	);
}

export async function setModel(
	sessionKey: string,
	provider: string,
	id: string,
): Promise<void> {
	await runCommand(sessionKey, (e) =>
		e.client.setModel(provider, id).then(() => undefined),
	);
}

export async function getSessionState(
	sessionKey: string,
): Promise<SessionState> {
	return runCommand(sessionKey, state);
}

export async function setThinkingLevel(
	sessionKey: string,
	level: ThinkingLevel,
): Promise<ThinkingLevel> {
	await runCommand(sessionKey, (e) => e.client.setThinkingLevel(level));
	return level;
}

export async function cycleThinkingLevel(
	sessionKey: string,
): Promise<ThinkingLevel | null> {
	const result = await runCommand(sessionKey, (e) =>
		e.client.cycleThinkingLevel(),
	);
	return result?.level ?? null;
}

export async function setMode(
	sessionKey: string,
	mode: AgentMode,
): Promise<AgentMode> {
	return runCommand(sessionKey, async (e) => {
		e.mode = mode;
		e.emit(sessionKey, { kind: "sessionState", state: { mode } });
		return mode;
	});
}

export async function getMode(sessionKey: string): Promise<AgentMode> {
	return runCommand(sessionKey, async (e) => e.mode);
}

async function replacementState(entry: Entry): Promise<SessionReplacement> {
	const s = await state(entry);
	return {
		cancelled: false,
		sessionPath: s.sessionPath,
		messages: await transcript(entry.client),
		thinkingLevel: s.thinkingLevel,
		mode: s.mode,
	};
}

export async function forkSession(
	sessionKey: string,
	entryId: string,
): Promise<SessionReplacement> {
	return runCommand(sessionKey, async (e) => {
		const result = await e.client.fork(entryId);
		if (result.cancelled) {
			const s = await state(e);
			return {
				cancelled: true,
				messages: [],
				thinkingLevel: s.thinkingLevel,
				mode: s.mode,
			};
		}
		await resetAdvisor(e.advisor);
		const replacement = await replacementState(e);
		e.advisor.cursor = replacement.messages.length;
		return replacement;
	});
}

export async function cloneSession(
	sessionKey: string,
): Promise<SessionReplacement> {
	return runCommand(sessionKey, async (e) => {
		const result = await e.client.clone();
		if (result.cancelled) {
			const s = await state(e);
			return {
				cancelled: true,
				messages: [],
				thinkingLevel: s.thinkingLevel,
				mode: s.mode,
			};
		}
		await resetAdvisor(e.advisor);
		const replacement = await replacementState(e);
		e.advisor.cursor = replacement.messages.length;
		return replacement;
	});
}

export async function renameSession(
	sessionKey: string,
	name: string,
): Promise<void> {
	await runCommand(sessionKey, (e) => e.client.setSessionName(name.trim()));
}

export async function getLastAssistantText(
	sessionKey: string,
): Promise<string | null> {
	return runCommand(sessionKey, (e) => e.client.getLastAssistantText());
}

function trashFile(path: string): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn("trash", [path], { stdio: "ignore" });
		child.once("error", () => resolve(false));
		child.once("close", (code) => resolve(code === 0));
	});
}

export async function deleteSession(sessionPath: string): Promise<void> {
	await access(sessionPath);
	for (const [key, entry] of pool) {
		if (entry.sessionPath === sessionPath) {
			pool.delete(key);
			await Promise.all([
				entry.client.stop().catch(() => {}),
				resetAdvisor(entry.advisor),
			]);
		}
	}
	if (!(await trashFile(sessionPath))) await unlink(sessionPath);
}

export async function getSessionStats(sessionKey: string) {
	return runCommand(sessionKey, (e) => e.client.getSessionStats());
}
