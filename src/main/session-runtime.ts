import { createRequire } from "node:module";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { ModelChoice, SessionEvent, TranscriptMessage, Block } from "../shared/types.ts";

const require = createRequire(import.meta.url);
const cliPath = require.resolve("@earendil-works/pi-coding-agent/dist/cli.js");

interface Entry { client: RpcClient; cwd: string; }
const pool = new Map<string, Entry>();
let counter = 0;

function toBlocks(msg: AgentMessage): TranscriptMessage | null {
  if (msg.role === "user") {
    const text = typeof msg.content === "string"
      ? msg.content
      : msg.content.map((c) => ("text" in c ? c.text : "")).join("");
    return { role: "user", blocks: [{ kind: "text", text }] };
  }
  if (msg.role === "assistant") {
    const blocks: Block[] = [];
    for (const c of msg.content) {
      if (c.type === "text") blocks.push({ kind: "text", text: c.text });
      else if (c.type === "thinking") blocks.push({ kind: "thinking", text: c.thinking });
      else if (c.type === "toolCall") blocks.push({ kind: "toolCall", id: c.id, name: c.name, args: c.arguments });
    }
    return { role: "assistant", blocks };
  }
  if (msg.role === "toolResult") {
    const text = msg.content.map((c) => ("text" in c ? c.text : "[non-text]")).join("");
    return { role: "tool", blocks: [{ kind: "toolResult", toolCallId: msg.toolCallId, toolName: msg.toolName, text, isError: msg.isError }] };
  }
  return null;
}

export async function openSession(
  arg: { path: string } | { newIn: string },
  emit: (sessionKey: string, ev: SessionEvent) => void,
): Promise<string> {
  const cwd = "path" in arg ? undefined : arg.newIn;
  const args = "path" in arg ? ["--session", arg.path] : [];
  const client = new RpcClient({ cliPath, cwd, args });
  await client.start();

  const sessionKey = `s${++counter}`;
  pool.set(sessionKey, { client, cwd: cwd ?? "" });

  client.onEvent((ev: AgentEvent) => {
    if (ev.type === "message_update") {
      const d = (ev as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
      if (d?.type === "text_delta" && d.delta) emit(sessionKey, { kind: "assistantDelta", text: d.delta });
    } else if (ev.type === "message_end") {
      const m = toBlocks((ev as { message: AgentMessage }).message);
      if (m) emit(sessionKey, { kind: "message", message: m });
    } else if (ev.type === "agent_end") {
      emit(sessionKey, { kind: "idle" });
    }
  });

  // Replay existing history for resumed sessions.
  if ("path" in arg) {
    const msgs = await client.getMessages().catch(() => [] as AgentMessage[]);
    const history = msgs.map(toBlocks).filter((m): m is TranscriptMessage => m !== null);
    emit(sessionKey, { kind: "reset", messages: history });
  } else {
    emit(sessionKey, { kind: "reset", messages: [] });
  }

  return sessionKey;
}

export async function closeSession(sessionKey: string): Promise<void> {
  const e = pool.get(sessionKey);
  if (!e) return;
  pool.delete(sessionKey);
  await e.client.stop().catch(() => {});
}

export async function sendPrompt(sessionKey: string, text: string): Promise<void> {
  const e = pool.get(sessionKey);
  if (!e) throw new Error("unknown session");
  await e.client.prompt(text);
}

export async function getModels(sessionKey: string): Promise<ModelChoice[]> {
  const e = pool.get(sessionKey);
  if (!e) throw new Error("unknown session");
  const models = await e.client.getAvailableModels();
  return models.map((m) => ({ provider: m.provider, id: m.id }));
}

export async function setModel(sessionKey: string, provider: string, id: string): Promise<void> {
  const e = pool.get(sessionKey);
  if (!e) throw new Error("unknown session");
  await e.client.setModel(provider, id);
}
