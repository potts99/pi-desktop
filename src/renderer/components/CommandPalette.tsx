import { useState, useRef, useEffect, useCallback } from "react";

export interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
}

export function CommandPalette({
  open,
  commands,
  onClose,
  onExecute,
}: {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
  onExecute: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = commands.filter(
    (c) =>
      c.label.toLowerCase().includes(filter.toLowerCase()) ||
      c.description.toLowerCase().includes(filter.toLowerCase()),
  );

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setFilter("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Clamp index when filtered list changes
  useEffect(() => {
    setIdx((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const execute = useCallback(
    (id: string) => {
      onExecute(id);
      onClose();
    },
    [onExecute, onClose],
  );

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[idx]) execute(filtered[idx].id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={handleKey}
        />
        <div className="palette-list">
          {filtered.length === 0 ? (
            <div className="palette-empty">No matching commands</div>
          ) : (
            filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`palette-item${i === idx ? " palette-selected" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => execute(cmd.id)}
                onMouseEnter={() => setIdx(i)}
              >
                <span className="palette-label">{cmd.label}</span>
                <span className="palette-desc">{cmd.description}</span>
                {cmd.shortcut && <kbd className="palette-shortcut">{cmd.shortcut}</kbd>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
