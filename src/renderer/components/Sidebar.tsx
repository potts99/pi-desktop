import type { WorkspaceGroup } from "../../shared/types.ts";

export function Sidebar({
  groups, activePath, pinnedPaths, onNewAgent, onAddWorkspace, onOpen, onNew, onTogglePin, onOpenSettings,
}: {
  groups: WorkspaceGroup[];
  activePath: string | null;
  pinnedPaths: string[];
  onNewAgent: () => void;
  onAddWorkspace: () => void;
  onOpen: (path: string) => void;
  onNew: (cwd: string) => void;
  onTogglePin: (path: string) => void;
  onOpenSettings: () => void;
}) {
  // Collect all sessions across groups, then filter to pinned ones
  const allSessions = groups.flatMap((g) =>
    g.sessions.map((s) => ({ ...s, cwd: g.path })),
  );
  const pinned = allSessions.filter((s) => pinnedPaths.includes(s.path));

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <button className="nav-item nav-primary" onClick={onNewAgent}>
          <span className="nav-icon">+</span>New Agent
        </button>
      </div>

      <div className="sidebar-scroll">
        {pinned.length > 0 && (
          <>
            <div className="section-head">Pinned</div>
            {pinned.map((s) => (
              <div key={s.path} className="session-row-wrap">
                <button
                  className={`session-row${s.path === activePath ? " selected" : ""}`}
                  onClick={() => onOpen(s.path)}
                  title={s.title}
                >
                  <span className="s-title">{s.title}</span>
                  <span className="s-sub">{s.subtitle}</span>
                </button>
                <button
                  className="pin-btn pinned"
                  onClick={(e) => { e.stopPropagation(); onTogglePin(s.path); }}
                  title="Unpin"
                >◆</button>
              </div>
            ))}
            <div className="section-head section-head-action">
              <span>Workspaces</span>
              <button className="section-add-btn" onClick={onAddWorkspace} title="Add workspace">+</button>
            </div>
          </>
        )}
        {pinned.length === 0 && (
          <div className="section-head section-head-action">
            <span>Workspaces</span>
            <button className="section-add-btn" onClick={onAddWorkspace} title="Add workspace">+</button>
          </div>
        )}
        {groups.length === 0 && (
          <div className="empty-hint">
            <div>No workspaces yet. Add one to see its agents.</div>
            <button className="empty-action" onClick={onAddWorkspace}>Add Workspace</button>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.path} className="ws-group">
            <div className="ws-head">
              <span className="ws-name"><span className="ws-icon" aria-hidden="true">▣</span>{g.name}</span>
              <button className="ws-new" onClick={() => onNew(g.path)} title={`New agent in ${g.name}`} aria-label={`New agent in ${g.name}`}>+</button>
            </div>
            {g.sessions.filter((s) => !pinnedPaths.includes(s.path)).map((s) => (
              <div key={s.path} className="session-row-wrap">
                <button
                  className={`session-row${s.path === activePath ? " selected" : ""}`}
                  onClick={() => onOpen(s.path)}
                  title={s.title}
                >
                  <span className="s-title">{s.title}</span>
                  <span className="s-sub">{s.subtitle}</span>
                </button>
                <button
                  className="pin-btn"
                  onClick={(e) => { e.stopPropagation(); onTogglePin(s.path); }}
                  title="Pin"
                >◇</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="avatar">pi</div>
        <div className="who">
          <div className="who-name">pi-desktop</div>
          <div className="who-plan">local agent</div>
        </div>
        <button className="sidebar-settings-btn" onClick={onOpenSettings} title="Settings">⚙</button>
      </div>
    </div>
  );
}
