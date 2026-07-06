import { useState } from "react";
import { Plus, Folder, Trash2, Pin, Settings, ChevronDown, ChevronRight } from "lucide-react";
import type { WorkspaceGroup } from "../../shared/types.ts";

const COLLAPSED_LIMIT = 4;

export function Sidebar({
  groups, activePath, pinnedPaths, onNewAgent, onAddWorkspace, onRemoveWorkspace, onOpen, onNew, onTogglePin, onOpenSettings,
}: {
  groups: WorkspaceGroup[];
  activePath: string | null;
  pinnedPaths: string[];
  onNewAgent: () => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  onOpen: (path: string) => void;
  onNew: (cwd: string) => void;
  onTogglePin: (path: string) => void;
  onOpenSettings: () => void;
}) {
  const allSessions = groups.flatMap((g) =>
    g.sessions.map((s) => ({ ...s, cwd: g.path })),
  );
  const pinned = allSessions.filter((s) => pinnedPaths.includes(s.path));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (path: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });

  return (
    <div className="sidebar">
      <div className="sidebar-top">
        <button className="nav-item nav-primary" onClick={onNewAgent}>
          <span className="nav-icon"><Plus size={16} /></span>New Agent
        </button>
      </div>

      <div className="sidebar-scroll">
        {pinned.length > 0 && (
          <>
            <div className="section-head">Pinned</div>
            {pinned.map((s) => (
              <div key={s.path} className="session-row-wrap">
                <button
                  className="pin-btn pinned"
                  onClick={(e) => { e.stopPropagation(); onTogglePin(s.path); }}
                  title="Unpin"
                ><Pin size={12} fill="currentColor" /></button>
                <button
                  className={`session-row${s.path === activePath ? " selected" : ""}`}
                  onClick={() => onOpen(s.path)}
                  title={s.title}
                >
                  <span className="s-title">{s.title}</span>
                  <span className="s-sub">{s.subtitle}</span>
                </button>
              </div>
            ))}
            <div className="section-head section-head-action">
              <span>Workspaces</span>
              <button className="section-add-btn" onClick={onAddWorkspace} title="Add workspace"><Plus size={14} /></button>
            </div>
          </>
        )}
        {pinned.length === 0 && (
          <div className="section-head section-head-action">
            <span>Workspaces</span>
            <button className="section-add-btn" onClick={onAddWorkspace} title="Add workspace"><Plus size={14} /></button>
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
              <span className="ws-name"><span className="ws-icon"><Folder size={14} /></span>{g.name}</span>
              <div className="ws-actions">
                <button className="ws-archive" onClick={() => onRemoveWorkspace(g.path)} title={`Remove ${g.name}`} aria-label={`Remove ${g.name}`}><Trash2 size={14} /></button>
                <button className="ws-new" onClick={() => onNew(g.path)} title={`New agent in ${g.name}`} aria-label={`New agent in ${g.name}`}><Plus size={14} /></button>
              </div>
            </div>
            {(() => {
              const visible = g.sessions.filter((s) => !pinnedPaths.includes(s.path));
              const isExpanded = expandedGroups.has(g.path);
              const shown = isExpanded ? visible : visible.slice(0, COLLAPSED_LIMIT);
              const hiddenCount = visible.length - COLLAPSED_LIMIT;
              return (
                <>
                  {shown.map((s) => (
                    <div key={s.path} className="session-row-wrap">
                      <button
                        className="pin-btn"
                        onClick={(e) => { e.stopPropagation(); onTogglePin(s.path); }}
                        title="Pin"
                      ><Pin size={12} /></button>
                      <button
                        className={`session-row${s.path === activePath ? " selected" : ""}`}
                        onClick={() => onOpen(s.path)}
                        title={s.title}
                      >
                        <span className="s-title">{s.title}</span>
                        <span className="s-sub">{s.subtitle}</span>
                      </button>
                    </div>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      className="ws-more-btn"
                      onClick={() => toggleGroup(g.path)}
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      {isExpanded ? "Show less" : `+${hiddenCount} more`}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="avatar">pi</div>
        <div className="who">
          <div className="who-name">pi-desktop</div>
          <div className="who-plan">local agent</div>
        </div>
        <button className="sidebar-settings-btn" onClick={onOpenSettings} title="Settings"><Settings size={16} /></button>
      </div>
    </div>
  );
}
