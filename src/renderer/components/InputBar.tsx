import { useState } from "react";
import type { ModelChoice, QueueState, ThinkingLevel } from "../../shared/types.ts";

export function InputBar({
  disabled,
  streaming,
  models,
  thinkingLevel,
  thinkingLevels,
  queue,
  onSend,
  onStop,
  onModel,
  onThinking,
  onCycleThinking,
}: {
  disabled: boolean;
  streaming: boolean;
  models: ModelChoice[];
  thinkingLevel: ThinkingLevel;
  thinkingLevels: ThinkingLevel[];
  queue: QueueState;
  onSend: (text: string, mode: "prompt" | "steer" | "followUp") => void;
  onStop: () => void;
  onModel: (provider: string, id: string) => void;
  onThinking: (level: ThinkingLevel) => void;
  onCycleThinking: () => void;
}) {
  const [text, setText] = useState("");
  const [streamMode, setStreamMode] = useState<"steer" | "followUp">("steer");
  const submit = () => {
    if (text.trim()) {
      onSend(text.trim(), streaming ? streamMode : "prompt");
      setText("");
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
        <textarea
          value={text}
          placeholder={disabled ? "Open or create an agent…" : "Send a message…"}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) { e.preventDefault(); submit(); } }}
        />
        <div className="composer-row">
          <div className="composer-controls">
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
