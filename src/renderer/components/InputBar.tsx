import { useRef, useState, useCallback } from "react";
import type { AgentMode, ModelChoice, QueueState, ThinkingLevel } from "../../shared/types.ts";

const modes: AgentMode[] = ["normal", "agent", "yolo", "manual"];

interface SlashCommand {
  id: string;
  label: string;
  description: string;
}

const slashCommands: SlashCommand[] = [
  { id: "edit", label: "/edit", description: "Edit files in the workspace" },
  { id: "search", label: "/search", description: "Search across the codebase" },
  { id: "task", label: "/task", description: "Create a task for the agent" },
  { id: "plan", label: "/plan", description: "Create an implementation plan" },
  { id: "file", label: "/file", description: "Reference a file by path" },
  { id: "symbol", label: "/symbol", description: "Reference a symbol in code" },
  { id: "explain", label: "/explain", description: "Explain selected code" },
  { id: "fix", label: "/fix", description: "Fix issues in selected code" },
  { id: "test", label: "/test", description: "Generate tests for selected code" },
  { id: "refactor", label: "/refactor", description: "Refactor selected code" },
];

export function InputBar({
  disabled,
  streaming,
  models,
  mode,
  thinkingLevel,
  thinkingLevels,
  queue,
  onSend,
  onStop,
  onModel,
  onMode,
  onThinking,
  onCycleThinking,
}: {
  disabled: boolean;
  streaming: boolean;
  models: ModelChoice[];
  mode: AgentMode;
  thinkingLevel: ThinkingLevel;
  thinkingLevels: ThinkingLevel[];
  queue: QueueState;
  onSend: (text: string, mode: "prompt" | "steer" | "followUp") => void;
  onStop: () => void;
  onModel: (provider: string, id: string) => void;
  onMode: (mode: AgentMode) => void;
  onThinking: (level: ThinkingLevel) => void;
  onCycleThinking: () => void;
}) {
  const [text, setText] = useState("");
  const [streamMode, setStreamMode] = useState<"steer" | "followUp">("steer");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash command state
  const [slashActive, setSlashActive] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIdx, setSlashIdx] = useState(0);
  const [slashStart, setSlashStart] = useState(0); // where the / was typed

  const filtered = slashCommands.filter((c) =>
    c.label.toLowerCase().includes(slashFilter.toLowerCase()),
  );

  const closeSlash = useCallback(() => {
    setSlashActive(false);
    setSlashFilter("");
    setSlashIdx(0);
  }, []);

  const applySlash = useCallback((cmd: SlashCommand) => {
    const before = text.slice(0, slashStart);
    const after = text.slice(textareaRef.current?.selectionStart ?? slashStart + slashFilter.length + 1);
    const newText = `${before}${cmd.label} ${after}`;
    setText(newText);
    closeSlash();
    // Focus back on textarea after state settles
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const pos = before.length + cmd.label.length + 1;
        ta.setSelectionRange(pos, pos);
      }
    }, 0);
  }, [text, slashStart, slashFilter, closeSlash]);

  const handleChange = (value: string) => {
    setText(value);
    const ta = textareaRef.current;
    if (!ta) return;
    // Check if we're in a slash command context — look backwards from cursor for a `/`
    const cursor = ta.selectionStart;
    const before = value.slice(0, cursor);
    const slashMatch = before.match(/(?:^|\s)\/(\S*)$/);
    if (slashMatch) {
      const filterText = slashMatch[1];
      const slashPos = cursor - filterText.length - 1;
      setSlashActive(true);
      setSlashFilter(filterText);
      setSlashStart(slashPos);
      setSlashIdx(0);
    } else {
      if (slashActive) closeSlash();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashActive) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (filtered[slashIdx]) applySlash(filtered[slashIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeSlash();
        return;
      }
    }
    // Regular submit
    if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    if (text.trim()) {
      onSend(text.trim(), streaming ? streamMode : "prompt");
      setText("");
      closeSlash();
    }
  };

  const pendingCount = queue.steering.length + queue.followUp.length;

  return (
    <div className="composer-wrap">
      {pendingCount > 0 && (
        <div className="queue-strip">
          <span>{queue.steering.length} steer</span>
          <span>{queue.followUp.length} follow-up</span>
        </div>
      )}
      <div className="composer">
        <div className="composer-textarea-wrap">
          <textarea
            ref={textareaRef}
            value={text}
            placeholder={disabled ? "Open or create an agent…" : "Send a message…"}
            disabled={disabled}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {slashActive && filtered.length > 0 && (
            <div className="slash-popup">
              {filtered.map((cmd, i) => (
                <div
                  key={cmd.id}
                  className={`slash-item${i === slashIdx ? " slash-selected" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySlash(cmd)}
                >
                  <span className="slash-label">{cmd.label}</span>
                  <span className="slash-desc">{cmd.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="composer-row">
          <div className="composer-controls">
            <select
              className="mode-picker"
              disabled={disabled}
              value={mode}
              onChange={(e) => onMode(e.target.value as AgentMode)}
            >
              {modes.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              className="model-picker"
              disabled={disabled || models.length === 0}
              onChange={(e) => { const m = models[Number(e.target.value)]; if (m) onModel(m.provider, m.id); }}
            >
              {models.map((m, i) => <option key={`${m.provider}/${m.id}`} value={i}>{m.provider}/{m.id}</option>)}
            </select>
            <select
              className="thinking-picker"
              disabled={disabled}
              value={thinkingLevel}
              onChange={(e) => onThinking(e.target.value as ThinkingLevel)}
              onDoubleClick={onCycleThinking}
            >
              {thinkingLevels.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
            {streaming && (
              <select className="delivery-picker" value={streamMode} onChange={(e) => setStreamMode(e.target.value as "steer" | "followUp")}>
                <option value="steer">steer</option>
                <option value="followUp">follow-up</option>
              </select>
            )}
          </div>
          {streaming ? (
            <div className="stream-actions">
              <button className="queue-btn" disabled={disabled || !text.trim()} onClick={submit}>Queue</button>
              <button className="send-btn stop-btn" disabled={disabled} onClick={onStop}>Stop</button>
            </div>
          ) : (
            <button className="send-btn" disabled={disabled || !text.trim()} onClick={submit}>Send</button>
          )}
        </div>
      </div>
    </div>
  );
}
