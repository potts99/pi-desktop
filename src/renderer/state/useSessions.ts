import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptMessage, WorkspaceGroup, ModelChoice } from "../../shared/types.ts";

export function useSessions() {
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [models, setModels] = useState<ModelChoice[]>([]);
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
        setMessages((m) => [...m, ev.message]);
        if (ev.message.role === "assistant") setStreamingText(""); // final text has landed
      }
      else if (ev.kind === "assistantDelta") { setStreaming(true); setStreamingText((t) => t + ev.text); }
      else if (ev.kind === "idle") { setStreaming(false); setStreamingText(""); }
      else if (ev.kind === "error") { setStreaming(false); setStreamingText(""); }
    }), []);

  const openSession = useCallback(async (arg: { path: string } | { newIn: string }) => {
    if (!window.pi) return;
    const { sessionKey, messages: history } = await window.pi.openSession(arg);
    setActiveKey(sessionKey);
    setActivePath("path" in arg ? arg.path : null);
    setMessages(history ?? []); // full history applied synchronously (guard against stale IPC shape)
    setStreamingText("");
    setStreaming(false);
    setModels(await window.pi.getModels(sessionKey).catch(() => []));
  }, []);

  const send = useCallback(async (text: string) => {
    if (!activeKey || !window.pi) return;
    // No optimistic add — pi emits a message_end for the user prompt almost
    // immediately, which is the authoritative copy (avoids duplicates).
    setStreaming(true);
    await window.pi.sendPrompt(activeKey, text);
  }, [activeKey]);

  const addWorkspace = useCallback(async () => { if (!window.pi) return; await window.pi.addWorkspace(); refreshWorkspaces(); }, [refreshWorkspaces]);

  const activeTitle = activePath
    ? groups.flatMap((g) => g.sessions).find((s) => s.path === activePath)?.title ?? "Session"
    : activeKey ? "New Agent" : null;

  return { groups, activeKey, activePath, activeTitle, messages, streamingText, streaming, models, openSession, send, addWorkspace };
}
