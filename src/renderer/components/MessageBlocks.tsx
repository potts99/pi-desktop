import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TranscriptMessage } from "../../shared/types.ts";

function plainText(msg: TranscriptMessage): string {
  return msg.blocks
    .map((b) => {
      if (b.kind === "text" || b.kind === "thinking") return b.text;
      if (b.kind === "toolResult") return b.text;
      if (b.kind === "toolCall") return `${b.name}\n${JSON.stringify(b.args, null, 2)}`;
      return "";
    })
    .join("\n\n")
    .trim();
}

export function MessageBlocks({
  msg,
  onFork,
}: {
  msg: TranscriptMessage;
  onFork?: (entryId: string) => void;
}) {
  return (
    <div className="msg-wrap">
      <div className={`msg msg-${msg.role}`}>
        {msg.blocks.map((b, i) => {
          if (b.kind === "text") return <Markdown key={i} remarkPlugins={[remarkGfm]}>{b.text}</Markdown>;
          if (b.kind === "thinking") return <pre key={i} className="thinking">{b.text}</pre>;
          if (b.kind === "toolCall")
            return <details key={i} className="tool"><summary>{b.name}</summary><pre>{JSON.stringify(b.args, null, 2)}</pre></details>;
          return <details key={i} className={`tool ${b.isError ? "tool-error" : ""}`}><summary>{b.toolName} result</summary><pre>{b.text}</pre></details>;
        })}
      </div>
      <div className="msg-actions">
        <button title="Good response" onClick={() => undefined}>+</button>
        <button title="Bad response" onClick={() => undefined}>-</button>
        {msg.role === "user" && msg.id && <button title="Fork from here" onClick={() => onFork?.(msg.id!)}>Branch</button>}
        <button title="Copy message" onClick={() => void navigator.clipboard?.writeText(plainText(msg))}>Copy</button>
      </div>
    </div>
  );
}
