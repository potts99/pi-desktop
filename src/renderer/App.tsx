import { useEffect, useState, useCallback } from "react";
import "./styles/glass.css";
import { useSessions } from "./state/useSessions.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Transcript } from "./components/Transcript.tsx";
import { InputBar } from "./components/InputBar.tsx";
import { TabBar } from "./components/TabBar.tsx";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette.tsx";

const commands: PaletteCommand[] = [
  { id: "newAgent", label: "New Agent", description: "Open a new agent tab", shortcut: "\u2318N" },
  { id: "closeTab", label: "Close Tab", description: "Close the current tab", shortcut: "\u2318W" },
  { id: "nextTab", label: "Next Tab", description: "Switch to the next tab", shortcut: "\u2318\u21E7]" },
  { id: "prevTab", label: "Previous Tab", description: "Switch to the previous tab", shortcut: "\u2318\u21E7[" },
  { id: "focusInput", label: "Focus Input", description: "Focus the chat input", shortcut: "\u2318L" },
  { id: "rename", label: "Rename Agent", description: "Rename the current agent session" },
  { id: "clone", label: "Clone Agent", description: "Clone the current agent session" },
  { id: "deleteAgent", label: "Delete Agent", description: "Delete the current agent session" },
  { id: "closeWindow", label: "Close Window", description: "Close the pi window", shortcut: "\u2318W" },
  { id: "minimize", label: "Minimize", description: "Minimize the window", shortcut: "\u2318M" },
  { id: "toggleSidebar", label: "Toggle Sidebar", description: "Show or hide the sidebar", shortcut: "\u2318B" },
];

export default function App() {
  const s = useSessions();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const rename = useCallback(() => {
    const name = window.prompt("Session name", s.activeTitle ?? "");
    if (name) void s.rename(name);
  }, [s]);

  const remove = useCallback(() => {
    if (window.confirm("Delete this session?")) void s.remove();
  }, [s]);

  const executeCommand = useCallback(
    (id: string) => {
      switch (id) {
        case "newAgent": void s.newAgent(); break;
        case "closeTab": s.closeTab(s.activeIdx); break;
        case "nextTab": s.nextTab(); break;
        case "prevTab": s.prevTab(); break;
        case "focusInput": document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(); break;
        case "rename": rename(); break;
        case "clone": void s.clone(); break;
        case "deleteAgent": remove(); break;
        case "closeWindow": void window.pi?.closeWindow(); break;
        case "minimize": void window.pi?.minimizeWindow(); break;
        case "toggleSidebar": setSidebarOpen((v) => !v); break;
      }
    },
    [s, rename, remove],
  );

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "k" && mod) { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (paletteOpen) return; // Don't handle other shortcuts when palette is open
      if (!mod) return;
      if (e.key === "n" && !e.shiftKey) { e.preventDefault(); void s.newAgent(); }
      else if (e.key === "w") { e.preventDefault(); s.closeTab(s.activeIdx); }
      else if (e.key === "]" && e.shiftKey) { e.preventDefault(); s.nextTab(); }
      else if (e.key === "[" && e.shiftKey) { e.preventDefault(); s.prevTab(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, paletteOpen]);

  return (
    <div className="app">
      {sidebarOpen && (
        <Sidebar
          groups={s.groups}
          activePath={s.activePath}
          onNewAgent={s.newAgent}
          onOpen={(path) => s.openSession({ path })}
          onNew={(cwd) => s.openSession({ newIn: cwd })}
        />
      )}
      <div className="main-pane">
        <div className="topbar" onDoubleClick={async () => { const m = await window.pi.isMaximized(); m ? window.pi.unmaximizeWindow() : window.pi.maximizeWindow(); }}>
          <TabBar
            tabs={s.tabs}
            activeIdx={s.activeIdx}
            onActivate={s.activateTab}
            onClose={s.closeTab}
          />
          <div className="top-actions">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} title="Show sidebar (\u2318B)">Sidebar</button>
            )}
            {s.activeKey && (
              <>
                <button onClick={rename}>Rename</button>
                <button onClick={() => void s.clone()}>Clone</button>
                <button onClick={remove}>Delete</button>
              </>
            )}
          </div>
        </div>
        {(s.error || s.retry.active) && (
          <div className={`status-banner ${s.error ? "status-error" : ""}`}>
            <span>
              {s.error ?? `Retrying ${s.retry.attempt ?? ""}/${s.retry.maxAttempts ?? ""}`}
            </span>
            {s.error && <button onClick={s.retryLast}>Retry</button>}
            {s.error && <button onClick={s.clearError}>Dismiss</button>}
          </div>
        )}
        {s.opening ? (
          <div className="empty-state">
            <div className="spinner" />
            <div className="empty-sub">Opening agent…</div>
          </div>
        ) : s.activeKey ? (
          <Transcript messages={s.messages} streamingText={s.streamingText} onFork={s.fork} />
        ) : (
          <div className="empty-state">
            <div className="empty-title">pi</div>
            <div className="empty-sub">Pick an agent on the left, or start a New Agent.</div>
          </div>
        )}
        <InputBar
          disabled={!s.activeKey}
          streaming={s.streaming}
          models={s.models}
          mode={s.mode}
          cwd={s.groups.find((g) => g.sessions.some((r) => r.path === s.activePath))?.path ?? null}
          thinkingLevel={s.thinkingLevel}
          thinkingLevels={s.thinkingLevels}
          queue={s.queue}
          onSend={s.send}
          onStop={s.abort}
          onModel={(p, i) => s.activeKey && window.pi.setModel(s.activeKey, p, i)}
          onMode={s.setMode}
          onThinking={s.setThinkingLevel}
          onCycleThinking={s.cycleThinking}
        />
      </div>
      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
        onExecute={executeCommand}
      />
    </div>
  );
}
