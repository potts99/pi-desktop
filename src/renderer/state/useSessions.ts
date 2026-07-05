import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentMode,
  TabState,
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

function freshTab(sessionKey: string, sessionPath: string | null): TabState {
  return {
    sessionKey,
    sessionPath,
    messages: [],
    streamingText: "",
    streaming: false,
    models: [],
    thinkingLevel: "medium",
    mode: "normal",
    queue: emptyQueue,
    retry: { active: false },
    error: null,
  };
}

export function useSessions() {
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [opening, setOpening] = useState(false);

  const lastSendRef = useRef<{ text: string; mode: "prompt" | "steer" | "followUp" } | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;

  const activeKey = tabs[activeIdx]?.sessionKey ?? null;

  /** Apply an update to the tab with the given session key. */
  function patchTab(key: string, fn: (t: TabState) => TabState) {
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.sessionKey === key);
      if (i < 0) return prev;
      const next = fn(prev[i]);
      if (next === prev[i]) return prev;
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
  }

  const refreshWorkspaces = useCallback(async () => {
    if (!window.pi) return;
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

  // Session events dispatch to whichever tab owns the session key.
  useEffect(() =>
    window.pi?.onSessionEvent((key, ev) => {
      if (ev.kind === "message") {
        patchTab(key, (t) => ({ ...t, messages: mergeMessage(t.messages, ev.message), streamingText: ev.message.role === "assistant" ? "" : t.streamingText }));
      } else if (ev.kind === "assistantDelta") {
        patchTab(key, (t) => ({ ...t, streaming: true, streamingText: t.streamingText + ev.text }));
      } else if (ev.kind === "idle") {
        patchTab(key, (t) => ({ ...t, streaming: false, streamingText: "" }));
      } else if (ev.kind === "queue") {
        patchTab(key, (t) => ({ ...t, queue: ev.queue }));
      } else if (ev.kind === "retry") {
        patchTab(key, (t) => ({ ...t, retry: ev.retry }));
      } else if (ev.kind === "sessionState") {
        patchTab(key, (t) => ({
          ...t,
          sessionPath: ev.state.sessionPath !== undefined ? (ev.state.sessionPath ?? null) : t.sessionPath,
          thinkingLevel: ev.state.thinkingLevel ?? t.thinkingLevel,
          mode: ev.state.mode ?? t.mode,
          streaming: ev.state.isStreaming ?? t.streaming,
          queue: ev.state.queue ?? t.queue,
        }));
      } else if (ev.kind === "error") {
        patchTab(key, (t) => ({ ...t, streaming: false, streamingText: "", error: ev.message }));
      }
    }), []);

  function activateTab(idx: number) {
    if (idx >= 0 && idx < tabsRef.current.length) setActiveIdx(idx);
  }

  function closeTab(idx: number) {
    const tab = tabsRef.current[idx];
    if (!tab) return;
    // Close the underlying session.
    void window.pi?.closeSession(tab.sessionKey);
    setTabs((prev) => prev.filter((_, i) => i !== idx));
    // Adjust active index.
    setActiveIdx((prev) => {
      if (prev > idx) return prev - 1;
      if (prev === idx) return Math.min(idx, tabsRef.current.length - 2);
      return prev;
    });
  }

  function nextTab() {
    setActiveIdx((prev) => (tabsRef.current.length > 0 ? (prev + 1) % tabsRef.current.length : -1));
  }

  function prevTab() {
    setActiveIdx((prev) => (tabsRef.current.length > 0 ? (prev - 1 + tabsRef.current.length) % tabsRef.current.length : -1));
  }

  const openSession = useCallback(async (arg: { path: string } | { newIn: string }) => {
    if (!window.pi) return;
    const sessionPath = "path" in arg ? arg.path : null;

    // Reuse existing tab if this session is already open.
    const existing = tabsRef.current.findIndex((t) => t.sessionPath === sessionPath && sessionPath !== null);
    if (existing >= 0) { setActiveIdx(existing); return; }

    setOpening(true);
    const { sessionKey, messages: history, state } = await window.pi.openSession(arg);
    const tab = freshTab(sessionKey, state.sessionPath ?? sessionPath);
    tab.messages = history ?? [];
    tab.streaming = state.isStreaming;
    tab.thinkingLevel = state.thinkingLevel;
    tab.mode = state.mode;
    tab.queue = state.queue;

    setTabs((prev) => [...prev, tab]);
    setActiveIdx((prev) => (prev >= 0 ? prev : 0)); // stays on current, or lands on first
    // Need fresh index after setTabs — use length as the new tab's index.
    const newIdx = tabsRef.current.length;
    setActiveIdx(newIdx);
    setOpening(false);

    void window.pi.getModels(sessionKey).then((m) => patchTab(sessionKey, (t) => ({ ...t, models: m }))).catch(() => {});
  }, []);

  const send = useCallback(async (text: string, mode: "prompt" | "steer" | "followUp" = "prompt") => {
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key || !window.pi) return;
    patchTab(key, (t) => ({ ...t, streaming: true, error: null }));
    lastSendRef.current = { text, mode };
    try {
      await window.pi.sendPrompt(key, text, mode);
    } catch (err) {
      patchTab(key, (t) => ({ ...t, streaming: false, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const retryLast = useCallback(() => {
    const last = lastSendRef.current;
    if (last) void send(last.text, last.mode);
  }, [send]);

  const abort = useCallback(async () => {
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key || !window.pi) return;
    try {
      await window.pi.abortSession(key);
      patchTab(key, (t) => ({ ...t, streaming: false, streamingText: "", retry: { active: false } }));
    } catch (err) {
      patchTab(key, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const setThinkingLevel = useCallback(async (level: ThinkingLevel) => {
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key || !window.pi) return;
    try {
      const applied = await window.pi.setThinkingLevel(key, level);
      patchTab(key, (t) => ({ ...t, thinkingLevel: applied }));
    } catch (err) {
      patchTab(key, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const cycleThinking = useCallback(async () => {
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key || !window.pi) return;
    try {
      const next = await window.pi.cycleThinkingLevel(key);
      if (next) patchTab(key, (t) => ({ ...t, thinkingLevel: next }));
    } catch (err) {
      patchTab(key, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const setMode = useCallback(async (m: AgentMode) => {
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key || !window.pi) return;
    try {
      const applied = await window.pi.setMode(key, m);
      patchTab(key, (t) => ({ ...t, mode: applied }));
    } catch (err) {
      patchTab(key, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const applyReplacement = useCallback((replacement: SessionReplacement) => {
    if (replacement.cancelled) return;
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key) return;
    patchTab(key, (t) => ({
      ...t,
      sessionPath: replacement.sessionPath ?? t.sessionPath,
      messages: replacement.messages,
      mode: replacement.mode,
      thinkingLevel: replacement.thinkingLevel,
      streamingText: "",
      streaming: false,
      queue: emptyQueue,
      error: null,
    }));
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  const fork = useCallback(async (entryId: string) => {
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key || !window.pi) return;
    try {
      applyReplacement(await window.pi.forkSession(key, entryId));
    } catch (err) {
      patchTab(key, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [applyReplacement]);

  const clone = useCallback(async () => {
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key || !window.pi) return;
    try {
      applyReplacement(await window.pi.cloneSession(key));
    } catch (err) {
      patchTab(key, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [applyReplacement]);

  const rename = useCallback(async (name: string) => {
    const key = tabsRef.current[activeIdxRef.current]?.sessionKey;
    if (!key || !window.pi || !name.trim()) return;
    try {
      await window.pi.renameSession(key, name.trim());
      await refreshWorkspaces();
    } catch (err) {
      patchTab(key, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [refreshWorkspaces]);

  const remove = useCallback(async () => {
    const tab = tabsRef.current[activeIdxRef.current];
    if (!tab?.sessionPath || !window.pi) return;
    try {
      await window.pi.deleteSession(tab.sessionPath);
      closeTab(activeIdxRef.current);
      await refreshWorkspaces();
    } catch (err) {
      patchTab(tab.sessionKey, (t) => ({ ...t, error: err instanceof Error ? err.message : String(err) }));
    }
  }, [refreshWorkspaces]);

  const newAgent = useCallback(async () => {
    if (!window.pi) return;
    if (groups.length === 0) { await window.pi.addWorkspace(); await refreshWorkspaces(); return; }
    const tab = tabsRef.current[activeIdxRef.current];
    const activeGroup = tab?.sessionPath
      ? groups.find((g) => g.sessions.some((s) => s.path === tab.sessionPath))
      : undefined;
    const cwd = activeGroup?.path ?? groups[0].path;
    await openSession({ newIn: cwd });
  }, [groups, openSession, refreshWorkspaces]);

  // Derived from active tab
  const tab = tabs[activeIdx];
  const activePath = tab?.sessionPath ?? null;
  const messages = tab?.messages ?? [];
  const streamingText = tab?.streamingText ?? "";
  const streaming = tab?.streaming ?? false;
  const models = tab?.models ?? [];
  const thinkingLevel = tab?.thinkingLevel ?? "medium";
  const mode = tab?.mode ?? "normal";
  const queue = tab?.queue ?? emptyQueue;
  const retry = tab?.retry ?? { active: false };
  const error = tab?.error ?? null;

  const activeTitle = activePath
    ? groups.flatMap((g) => g.sessions).find((s) => s.path === activePath)?.title ?? "Session"
    : activeKey ? "New Agent" : null;

  const clearError = useCallback(() => {
    if (activeKey) patchTab(activeKey, (t) => ({ ...t, error: null }));
  }, [activeKey]);

  return {
    groups,
    tabs,
    activeIdx,
    activeKey,
    activePath,
    activeTitle,
    opening,
    messages,
    streamingText,
    streaming,
    models,
    thinkingLevel,
    mode,
    thinkingLevels,
    queue,
    retry,
    error,
    openSession,
    send,
    retryLast,
    abort,
    setThinkingLevel,
    setMode,
    cycleThinking,
    fork,
    clone,
    rename,
    remove,
    newAgent,
    closeTab,
    activateTab,
    nextTab,
    prevTab,
    clearError,
  };
}
