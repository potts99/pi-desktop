import type { TabState } from "../../shared/types.ts";

export function TabBar({
  tabs,
  activeIdx,
  onActivate,
  onClose,
}: {
  tabs: TabState[];
  activeIdx: number;
  onActivate: (idx: number) => void;
  onClose: (idx: number) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div className="tab-bar">
      {tabs.map((tab, i) => {
        const title = tab.sessionPath
          ? tab.sessionPath.split("/").filter(Boolean).pop() ?? "Agent"
          : "New Agent";
        return (
          <div
            key={tab.sessionKey}
            className={`tab-item${i === activeIdx ? " tab-active" : ""}`}
            onClick={() => onActivate(i)}
          >
            <span className="tab-title">{title}</span>
            <button
              className="tab-close"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onClose(i); }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
