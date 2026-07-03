import type { WorkspaceGroup } from "../../shared/types.ts";

export function Sidebar({
  groups, onAddWorkspace, onOpen, onNew,
}: {
  groups: WorkspaceGroup[];
  onAddWorkspace: () => void;
  onOpen: (path: string) => void;
  onNew: (cwd: string) => void;
}) {
  return (
    <div className="sidebar">
      <button className="new-agent" onClick={onAddWorkspace}>+ Add workspace</button>
      {groups.map((g) => (
        <div key={g.path} className="ws-group">
          <div className="ws-head">
            <span>{g.name}</span>
            <button className="ws-new" onClick={() => onNew(g.path)}>New Agent</button>
          </div>
          {g.sessions.map((s) => (
            <button key={s.path} className="session-row" onClick={() => onOpen(s.path)}>
              <span className="s-title">{s.title}</span>
              <span className="s-sub">{s.subtitle}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
