import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TranscriptMessage,
  WorkspaceGroup,
  ModelChoice,
  QueueState,
  RetryState,
  ThinkingLevel,
  SessionReplacement,
} from "../../shared/types.ts";

const emptyQueue: QueueState = { steering: [], followUp: [] };
const thinkingLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

function messageText(message: TranscriptMessage): string {
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

function mergeMessage(messages: TranscriptMessage[], next: TranscriptMessage): TranscriptMessage[] {
  if (next.id) {
    const existing = messages.findIndex((m) => m.id === next.id);
    if (existing >= 0) {
      const copy = [...messages];
      copy[existing] = next;
      return copy;
    }
    const last = messages[messages.length - 1];
    if (last && !last.id && last.role === next.role && messageText(last) === messageText(next)) {
      return [...messages.slice(0, -1), next];
    }
  }
  return [...messages, next];
}

export function useSessions() {
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [thinkingLevel, setThinkingLevelState] = useState<ThinkingLevel>("medium");
  const [queue, setQueue] = useState<QueueState>(emptyQueue);
  const [retry, setRetry] = useState<RetryState>({ active: false });
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSendRef = useRef<{ text: string; mode: "prompt" | "steer" | "followUp" } | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  activeKeyRef.current = activeKey;

  const refreshWorkspaces = useCallback(async () => {
    if (!window.pi) return; // preload not loaded (e.g. plain-browser preview) — render shell only
    const paths = await window.pi.listWorkspaces();
    const gs = await Promise.all(
      paths.map(async (p) => ({
        path: p,
        name: p.split("/").filter(Boolean).pop() ?? p,
        sessions: await window.pi.listSessions(p),
      })),
    );
    setGroups(gs);
  }, []);

  useEffect(() => { refreshWorkspaces(); }, [refreshWorkspaces]);

  useEffect(() => window.pi?.onSessionsChanged(() => refreshWorkspaces()), [refreshWorkspaces]);

  // message_end (kind "message") is the single source of truth for committed
  // messages — pi emits it for user, assistant, and tool messages alike. The
  // text deltas only feed a transient streaming preview, so nothing is ever
  // rendered twice.
  useEffect(() =>
    window.pi?.onSessionEvent((key, ev) => {
      if (key !== activeKeyRef.current) return;
      if (ev.kind === "message") {
        setMessages((m) => mergeMessage(m, ev.message));
        if (ev.message.role === "assistant") setStreamingText(""); // final text has landed
      }
      else if (ev.kind === "assistantDelta") { setStreaming(true); setStreamingText((t) => t + ev.text); }
      else if (ev.kind === "idle") { setStreaming(false); setStreamingText(""); }
      else if (ev.kind === "queue") setQueue(ev.queue);
      else if (ev.kind === "retry") setRetry(ev.retry);
      else if (ev.kind === "sessionState") {
        if (ev.state.sessionPath !== undefined) setActivePath(ev.state.sessionPath ?? null);
        if (ev.state.thinkingLevel) setThinkingLevelState(ev.state.thinkingLevel);
        if (ev.state.isStreaming !== undefined) setStreaming(ev.state.isStreaming);
        if (ev.state.queue) setQueue(ev.state.queue);
      }
      else if (ev.kind === "error") { setStreaming(false); setStreamingText(""); setError(ev.message); }
    }), []);

  const openSession = useCallback(async (arg: { path: string } | { newIn: string }) => {
    if (!window.pi) return;
    // Optimistic: select + clear immediately so the click feels instant. The
    // transcript and models fill in once the spawned agent process is ready.
    setActiveKey(null);
    setActivePath("path" in arg ? arg.path : null);
    setMessages([]);
    setStreamingText("");
    setStreaming(false);
    setModels([]);
    setQueue(emptyQueue);
    setRetry({ active: false });
    setError(null);
    setOpening(true);

    const { sessionKey, messages: history, state } = await window.pi.openSession(arg);
    setActiveKey(sessionKey);
    setActivePath(state.sessionPath ?? ("path" in arg ? arg.path : null));
    setMessages(history ?? []);
    setStreaming(state.isStreaming);
    setThinkingLevelState(state.thinkingLevel);
    setQueue(state.queue);
    setOpening(false);
    // Models don't gate the render — fetch in the background.
    void window.pi.getModels(sessionKey).then(setModels).catch(() => setModels([]));
  }, []);

  const send = useCallback(async (text: string, mode: "prompt" | "steer" | "followUp" = "prompt") => {
    if (!activeKey || !window.pi) return;
    // No optimistic add — pi emits a message_end for the user prompt almost
    // immediately, which is the authoritative copy (avoids duplicates).
    setStreaming(true);
    setError(null);
    lastSendRef.current = { text, mode };
    try {
      await window.pi.sendPrompt(activeKey, text, mode);
    } catch (err) {
      setStreaming(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKey]);

  const retryLast = useCallback(() => {
    const last = lastSendRef.current;
    if (last) void send(last.text, last.mode);
  }, [send]);

  const abort = useCallback(async () => {
    if (!activeKey || !window.pi) return;
    try {
      await window.pi.abortSession(activeKey);
      setStreaming(false);
      setStreamingText("");
      setRetry({ active: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKey]);

  const setThinkingLevel = useCallback(async (level: ThinkingLevel) => {
    if (!activeKey || !window.pi) return;
    try {
      const applied = await window.pi.setThinkingLevel(activeKey, level);
      setThinkingLevelState(applied);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKey]);

  const cycleThinking = useCallback(async () => {
    if (!activeKey || !window.pi) return;
    try {
      const next = await window.pi.cycleThinkingLevel(activeKey);
      if (next) setThinkingLevelState(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKey]);

  const applyReplacement = useCallback((replacement: SessionReplacement) => {
    if (replacement.cancelled) return;
    setActivePath(replacement.sessionPath ?? null);
    setMessages(replacement.messages);
    setThinkingLevelState(replacement.thinkingLevel);
    setStreamingText("");
    setStreaming(false);
    setQueue(emptyQueue);
    setError(null);
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  const fork = useCallback(async (entryId: string) => {
    if (!activeKey || !window.pi) return;
    try {
      applyReplacement(await window.pi.forkSession(activeKey, entryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKey, applyReplacement]);

  const clone = useCallback(async () => {
    if (!activeKey || !window.pi) return;
    try {
      applyReplacement(await window.pi.cloneSession(activeKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKey, applyReplacement]);

  const rename = useCallback(async (name: string) => {
    if (!activeKey || !window.pi || !name.trim()) return;
    try {
      await window.pi.renameSession(activeKey, name.trim());
      await refreshWorkspaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeKey, refreshWorkspaces]);

  const remove = useCallback(async () => {
    if (!activePath || !window.pi) return;
    try {
      await window.pi.deleteSession(activePath);
      setActiveKey(null);
      setActivePath(null);
      setMessages([]);
      setStreaming(false);
      setStreamingText("");
      setQueue(emptyQueue);
      setError(null);
      await refreshWorkspaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activePath, refreshWorkspaces]);

  const newAgent = useCallback(async () => {
    if (!window.pi) return;
    if (groups.length === 0) { await window.pi.addWorkspace(); await refreshWorkspaces(); return; }
    const activeGroup = activePath ? groups.find((g) => g.sessions.some((s) => s.path === activePath)) : undefined;
    const cwd = activeGroup?.path ?? groups[0].path;
    await openSession({ newIn: cwd });
  }, [groups, activePath, openSession, refreshWorkspaces]);

  const activeTitle = activePath
    ? groups.flatMap((g) => g.sessions).find((s) => s.path === activePath)?.title ?? "Session"
    : activeKey ? "New Agent" : null;

  return {
    groups,
    activeKey,
    activePath,
    activeTitle,
    opening,
    messages,
    streamingText,
    streaming,
    models,
    thinkingLevel,
    thinkingLevels,
    queue,
    retry,
    error,
    openSession,
    send,
    retryLast,
    abort,
    setThinkingLevel,
    cycleThinking,
    fork,
    clone,
    rename,
    remove,
    newAgent,
    clearError: () => setError(null),
  };
}
