import type { WorkspaceGroup } from "../../shared/types.ts";

export function Sidebar({
  groups, activePath, onAddWorkspace, onOpen, onNew,
}: {
  groups: WorkspaceGroup[];
  activePath: string | null;
  onAddWorkspace: () => void;
  onOpen: (path: string) => void;
  onNew: (cwd: string) => void;
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <button className="nav-item nav-primary" onClick={onAddWorkspace}>
          <span className="nav-icon">✳</span>Add workspace
        </button>
      </div>

      <div className="sidebar-scroll">
        <div className="section-head">Workspaces</div>
        {groups.length === 0 && (
          <div className="empty-hint">No workspaces yet. Add one to see its agents.</div>
        )}
        {groups.map((g) => (
          <div key={g.path} className="ws-group">
            <div className="ws-head">
              <span className="ws-name">{g.name}</span>
              <button className="ws-new" onClick={() => onNew(g.path)}>New Agent</button>
            </div>
            {g.sessions.map((s) => (
              <button
                key={s.path}
                className={`session-row${s.path === activePath ? " selected" : ""}`}
                onClick={() => onOpen(s.path)}
                title={s.title}
              >
                <span className="s-title">{s.title}</span>
                <span className="s-sub">{s.subtitle}</span>
              </button>
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
      </div>
    </div>
  );
}
