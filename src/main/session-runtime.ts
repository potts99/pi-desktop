import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { access, readFile, readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { RpcClient, ModelRegistry, AuthStorage } from "@earendil-works/pi-coding-agent";
import { getSessionArgs } from "./desktop-config.ts";
import { getSettings } from "./settings-store.ts";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
  AgentMode,
  ModelChoice,
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
const resolvedCliPath = join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "cli.js");
const cliPath = resolvedCliPath.replace("/app.asar/", "/app.asar.unpacked/");
interface Entry {
  client: RpcClient;
  cwd: string;
  args: string[];
  sessionPath?: string;
  mode: AgentMode;
  emit: (sessionKey: string, ev: SessionEvent) => void;
}
const pool = new Map<string, Entry>();
let counter = 0;

const defaultQueue = { steering: [], followUp: [] };
const defaultMode: AgentMode = "normal";
const sharedModelsPath = join(homedir(), ".pi", "agent", "models.json");
let cachedAgentEnv: Record<string, string> | null = null;

interface SharedModelsFile {
  providers?: Record<string, { models?: Array<{ id?: unknown }> }>;
}

function stringEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
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
    dirs.push(...versions.filter((entry) => entry.isDirectory()).map((entry) => join(versionsDir, entry.name, "bin")));
  } catch { /* nvm may not be installed */ }
  return dirs;
}

async function agentEnv(): Promise<Record<string, string>> {
  if (cachedAgentEnv) return cachedAgentEnv;
  const existingPath = process.env.PATH ?? "";
  const dirs = [...await nodePathDirs(), ...existingPath.split(":")].filter(Boolean);
  const uniqueDirs = [...new Set(dirs)];
  cachedAgentEnv = { ...stringEnv(), PATH: uniqueDirs.join(":") };
  return cachedAgentEnv;
}

function toBlocks(msg: AgentMessage, id?: string): TranscriptMessage | null {
  if (msg.role === "user") {
    const text = typeof msg.content === "string"
      ? msg.content
      : msg.content.map((c) => ("text" in c ? c.text : "")).join("");
    return { id, role: "user", blocks: [{ kind: "text", text }] };
  }
  if (msg.role === "assistant") {
    const blocks: Block[] = [];
    for (const c of msg.content) {
      if (c.type === "text") blocks.push({ kind: "text", text: c.text });
      else if (c.type === "thinking") blocks.push({ kind: "thinking", text: c.thinking });
      else if (c.type === "toolCall") blocks.push({ kind: "toolCall", id: c.id, name: c.name, args: c.arguments });
    }
    return { id, role: "assistant", blocks };
  }
  if (msg.role === "toolResult") {
    const text = msg.content.map((c) => ("text" in c ? c.text : "[non-text]")).join("");
    const diff = (msg.details as { diff?: string } | undefined)?.diff;
    return { id, role: "tool", blocks: [{ kind: "toolResult", toolCallId: msg.toolCallId, toolName: msg.toolName, text, isError: msg.isError, diff }] };
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
      if (b.kind === "toolCall") return `${b.name}\n${JSON.stringify(b.args, null, 2)}`;
      return "";
    })
    .join("\n")
    .trim();
}

async function transcript(client: RpcClient): Promise<TranscriptMessage[]> {
  try {
    const { entries } = await client.getEntries();
    return entries.map(entryToMessage).filter((m): m is TranscriptMessage => m !== null);
  } catch {
    return (await client.getMessages().catch(() => [] as AgentMessage[]))
      .map((m) => toBlocks(m))
      .filter((m): m is TranscriptMessage => m !== null);
  }
}

export async function sharedModelChoices(): Promise<ModelChoice[]> {
  try {
    const cfg = JSON.parse(await readFile(sharedModelsPath, "utf-8")) as SharedModelsFile;
    return Object.entries(cfg.providers ?? {}).flatMap(([provider, value]) =>
      (value.models ?? [])
        .filter((model): model is { id: string } => typeof model.id === "string" && model.id.length > 0)
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

async function hydrateForkIds(client: RpcClient, message: TranscriptMessage): Promise<TranscriptMessage> {
  if (message.id || message.role !== "user") return message;
  const text = textOf(message);
  if (!text) return message;
  const forkMessages = await client.getForkMessages().catch(() => []);
  const match = [...forkMessages].reverse().find((m) => m.text.trim() === text);
  return match ? { ...message, id: match.entryId } : message;
}

function wireEvents(sessionKey: string, entry: Entry): void {
  entry.client.onEvent((ev: AgentEvent) => {
    if (ev.type === "message_update") {
      const d = (ev as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
      if (d?.type === "text_delta" && d.delta) entry.emit(sessionKey, { kind: "assistantDelta", text: d.delta });
    } else if (ev.type === "message_end") {
      const raw = (ev as { message: AgentMessage }).message;
      const m = toBlocks(raw);
      if (m) {
        entry.emit(sessionKey, { kind: "message", message: m });
        if (m.role === "user") {
          void hydrateForkIds(entry.client, m)
            .then((hydrated) => {
              if (hydrated.id && hydrated.id !== m.id) entry.emit(sessionKey, { kind: "message", message: hydrated });
            })
            .catch(() => {});
        }
      }
    } else if (ev.type === "agent_end") {
      entry.emit(sessionKey, { kind: "idle" });
    } else if (ev.type === "queue_update") {
      const q = ev as { steering?: string[]; followUp?: string[] };
      entry.emit(sessionKey, { kind: "queue", queue: { steering: q.steering ?? [], followUp: q.followUp ?? [] } });
    } else if (ev.type === "auto_retry_start") {
      const r = ev as { attempt?: number; maxAttempts?: number; delayMs?: number; errorMessage?: string };
      entry.emit(sessionKey, {
        kind: "retry",
        retry: { active: true, attempt: r.attempt, maxAttempts: r.maxAttempts, delayMs: r.delayMs, message: r.errorMessage },
      });
    } else if (ev.type === "auto_retry_end") {
      const r = ev as { success?: boolean; attempt?: number; finalError?: string };
      entry.emit(sessionKey, {
        kind: "retry",
        retry: { active: false, attempt: r.attempt, message: r.success === false ? r.finalError : undefined },
      });
      if (r.success === false && r.finalError) entry.emit(sessionKey, { kind: "error", message: r.finalError });
    }
  });
}

async function startClient(entry: Entry, sessionKey: string): Promise<void> {
  entry.client = new RpcClient({ cliPath, cwd: entry.cwd || undefined, args: entry.args, env: await agentEnv() });
  await entry.client.start();
  wireEvents(sessionKey, entry);
}

async function restartEntry(sessionKey: string, entry: Entry): Promise<void> {
  await entry.client.stop().catch(() => {});
  await startClient(entry, sessionKey);
  entry.emit(sessionKey, { kind: "error", message: "Agent process restarted after it stopped unexpectedly." });
}

function isDeadProcessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /process exited|Client not started|stdin is not writable|Agent process error/i.test(message);
}

async function runCommand<T>(sessionKey: string, fn: (entry: Entry) => Promise<T>): Promise<T> {
  const entry = pool.get(sessionKey);
  if (!entry) throw new Error("unknown session");
  try {
    return await fn(entry);
  } catch (error) {
    if (!isDeadProcessError(error)) {
      entry.emit(sessionKey, { kind: "error", message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
    await restartEntry(sessionKey, entry);
    return fn(entry);
  }
}

async function state(entry: Entry): Promise<SessionState> {
  const s = await entry.client.getState();
  entry.sessionPath = s.sessionFile;
  const model = s.model ? { provider: s.model.provider, id: s.model.id } : undefined;
  return {
    sessionPath: s.sessionFile,
    thinkingLevel: s.thinkingLevel,
    mode: entry.mode,
    isStreaming: s.isStreaming,
    queue: defaultQueue,
    model,
  };
}

export async function openSession(
  arg: { path: string } | { newIn: string },
  emit: (sessionKey: string, ev: SessionEvent) => void,
): Promise<{ sessionKey: string; messages: TranscriptMessage[]; state: SessionState }> {
  const cwd = "path" in arg ? undefined : arg.newIn;
  const sessionArgs = "path" in arg ? ["--session", arg.path] : [];
  const desktopArgs = await getSessionArgs();
  const args = [...sessionArgs, ...desktopArgs];
  const client = new RpcClient({ cliPath, cwd, args, env: await agentEnv() });
  await client.start();

  const sessionKey = `s${++counter}`;
  const entry: Entry = { client, cwd: cwd ?? "", args, sessionPath: "path" in arg ? arg.path : undefined, mode: defaultMode, emit };
  pool.set(sessionKey, entry);
  wireEvents(sessionKey, entry);

  // Return existing history synchronously so the renderer applies it the moment
  // the session becomes active — avoids a race with the live-event key guard.
  const history = "path" in arg ? await transcript(client) : [];
  const sessionState = await state(entry).catch(() => ({
    sessionPath: "path" in arg ? arg.path : undefined,
    thinkingLevel: "medium" as ThinkingLevel,
    mode: defaultMode,
    isStreaming: false,
    queue: defaultQueue,
  }));

  return { sessionKey, messages: history, state: sessionState };
}

export async function closeSession(sessionKey: string): Promise<void> {
  const e = pool.get(sessionKey);
  if (!e) return;
  pool.delete(sessionKey);
  await e.client.stop().catch(() => {});
}

export async function sendPrompt(sessionKey: string, text: string): Promise<void> {
  await runCommand(sessionKey, (e) => e.client.prompt(text));
}

export async function steer(sessionKey: string, text: string): Promise<void> {
  await runCommand(sessionKey, (e) => e.client.steer(text));
}

export async function followUp(sessionKey: string, text: string): Promise<void> {
  await runCommand(sessionKey, (e) => e.client.followUp(text));
}

export async function abortSession(sessionKey: string): Promise<void> {
  await runCommand(sessionKey, (e) => e.client.abort());
}

export async function getAllModelChoices(sessionKey?: string): Promise<ModelChoice[]> {
  // Read models directly from ModelRegistry — no running session needed.
  const agentDir = join(homedir(), ".pi", "agent");
  const authStorage = AuthStorage.create(agentDir);
  const registry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
  const models = registry.getAvailable()
    .map((m) => ({ provider: m.provider, id: m.id }));

  // If there's an active session, also merge its dynamically discovered models.
  if (sessionKey) {
    try {
      const runtimeModels = await runCommand(sessionKey, (e) => e.client.getAvailableModels());
      const runtime = runtimeModels.map((m) => ({ provider: m.provider, id: m.id }));
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
  return (await getAllModelChoices(sessionKey))
    .filter((m) => !hidden.has(`${m.provider}/${m.id}`));
}

export async function setModel(sessionKey: string, provider: string, id: string): Promise<void> {
  await runCommand(sessionKey, (e) => e.client.setModel(provider, id).then(() => undefined));
}

export async function getSessionState(sessionKey: string): Promise<SessionState> {
  return runCommand(sessionKey, state);
}

export async function setThinkingLevel(sessionKey: string, level: ThinkingLevel): Promise<ThinkingLevel> {
  await runCommand(sessionKey, (e) => e.client.setThinkingLevel(level));
  return level;
}

export async function cycleThinkingLevel(sessionKey: string): Promise<ThinkingLevel | null> {
  const result = await runCommand(sessionKey, (e) => e.client.cycleThinkingLevel());
  return result?.level ?? null;
}

export async function setMode(sessionKey: string, mode: AgentMode): Promise<AgentMode> {
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

export async function forkSession(sessionKey: string, entryId: string): Promise<SessionReplacement> {
  return runCommand(sessionKey, async (e) => {
    const result = await e.client.fork(entryId);
    if (result.cancelled) { const s = await state(e); return { cancelled: true, messages: [], thinkingLevel: s.thinkingLevel, mode: s.mode }; }
    return replacementState(e);
  });
}

export async function cloneSession(sessionKey: string): Promise<SessionReplacement> {
  return runCommand(sessionKey, async (e) => {
    const result = await e.client.clone();
    if (result.cancelled) { const s = await state(e); return { cancelled: true, messages: [], thinkingLevel: s.thinkingLevel, mode: s.mode }; }
    return replacementState(e);
  });
}

export async function renameSession(sessionKey: string, name: string): Promise<void> {
  await runCommand(sessionKey, (e) => e.client.setSessionName(name.trim()));
}

export async function getLastAssistantText(sessionKey: string): Promise<string | null> {
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
      await entry.client.stop().catch(() => {});
    }
  }
  if (!(await trashFile(sessionPath))) await unlink(sessionPath);
}

export async function getSessionStats(sessionKey: string) {
  return runCommand(sessionKey, (e) => e.client.getSessionStats());
}
