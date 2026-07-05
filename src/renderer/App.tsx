import { useEffect } from "react";
import "./styles/glass.css";
import { useSessions } from "./state/useSessions.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Transcript } from "./components/Transcript.tsx";
import { InputBar } from "./components/InputBar.tsx";
import { TabBar } from "./components/TabBar.tsx";

export default function App() {
  const s = useSessions();
  const rename = () => {
    const name = window.prompt("Session name", s.activeTitle ?? "");
    if (name) void s.rename(name);
  };
  const remove = () => {
    if (window.confirm("Delete this session?")) void s.remove();
  };

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "n" && !e.shiftKey) { e.preventDefault(); void s.newAgent(); }
      else if (e.key === "w") { e.preventDefault(); s.closeTab(s.activeIdx); }
      else if (e.key === "]" && e.shiftKey) { e.preventDefault(); s.nextTab(); }
      else if (e.key === "[" && e.shiftKey) { e.preventDefault(); s.prevTab(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  return (
    <div className="app">
      <Sidebar
        groups={s.groups}
        activePath={s.activePath}
        onNewAgent={s.newAgent}
        onOpen={(path) => s.openSession({ path })}
        onNew={(cwd) => s.openSession({ newIn: cwd })}
      />
      <div className="main-pane">
        <div className="topbar" onDoubleClick={async () => { const m = await window.pi.isMaximized(); m ? window.pi.unmaximizeWindow() : window.pi.maximizeWindow(); }}>
          <TabBar
            tabs={s.tabs}
            activeIdx={s.activeIdx}
            onActivate={s.activateTab}
            onClose={s.closeTab}
          />
          <div className="top-actions">
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
    </div>
  );
}
