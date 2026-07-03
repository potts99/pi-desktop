import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptMessage, WorkspaceGroup, ModelChoice } from "../../shared/types.ts";

export function useSessions() {
  const [groups, setGroups] = useState<WorkspaceGroup[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
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

  useEffect(() =>
    window.pi?.onSessionEvent((key, ev) => {
      if (key !== activeKeyRef.current) return;
      if (ev.kind === "reset") { setMessages(ev.messages); setStreaming(false); }
      else if (ev.kind === "message") setMessages((m) => [...m, ev.message]);
      else if (ev.kind === "assistantDelta") {
        setStreaming(true);
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last?.role === "assistant" && last.blocks[0]?.kind === "text") {
            const copy = m.slice();
            copy[copy.length - 1] = {
              role: "assistant",
              blocks: [{ kind: "text", text: (last.blocks[0].text ?? "") + ev.text }],
            };
            return copy;
          }
          return [...m, { role: "assistant", blocks: [{ kind: "text", text: ev.text }] }];
        });
      } else if (ev.kind === "idle") setStreaming(false);
      else if (ev.kind === "error") setStreaming(false);
    }), []);

  const openSession = useCallback(async (arg: { path: string } | { newIn: string }) => {
    if (!window.pi) return;
    const { sessionKey } = await window.pi.openSession(arg);
    setActiveKey(sessionKey);
    setActivePath("path" in arg ? arg.path : null);
    setMessages([]);
    setModels(await window.pi.getModels(sessionKey).catch(() => []));
  }, []);

  const send = useCallback(async (text: string) => {
    if (!activeKey || !window.pi) return;
    setMessages((m) => [...m, { role: "user", blocks: [{ kind: "text", text }] }]);
    await window.pi.sendPrompt(activeKey, text);
  }, [activeKey]);

  const addWorkspace = useCallback(async () => { if (!window.pi) return; await window.pi.addWorkspace(); refreshWorkspaces(); }, [refreshWorkspaces]);

  const activeTitle = activePath
    ? groups.flatMap((g) => g.sessions).find((s) => s.path === activePath)?.title ?? "Session"
    : activeKey ? "New Agent" : null;

  return { groups, activeKey, activePath, activeTitle, messages, streaming, models, openSession, send, addWorkspace };
}
