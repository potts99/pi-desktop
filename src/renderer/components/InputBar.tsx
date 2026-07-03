import { useState } from "react";
import type { ModelChoice } from "../../shared/types.ts";

export function InputBar({
  disabled, streaming, models, onSend, onModel,
}: {
  disabled: boolean;
  streaming: boolean;
  models: ModelChoice[];
  onSend: (text: string) => void;
  onModel: (provider: string, id: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => { if (text.trim()) { onSend(text.trim()); setText(""); } };
  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          value={text}
          placeholder={disabled ? "Open or create an agent…" : "Send a message…"}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) { e.preventDefault(); submit(); } }}
        />
        <div className="composer-row">
          <select
            className="model-picker"
            disabled={disabled || models.length === 0}
            onChange={(e) => { const m = models[Number(e.target.value)]; if (m) onModel(m.provider, m.id); }}
          >
            {models.map((m, i) => <option key={`${m.provider}/${m.id}`} value={i}>{m.provider}/{m.id}</option>)}
          </select>
          <button className="send-btn" disabled={disabled || streaming} onClick={submit}>
            {streaming ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
