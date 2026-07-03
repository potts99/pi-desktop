import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TranscriptMessage } from "../../shared/types.ts";

export function MessageBlocks({ msg }: { msg: TranscriptMessage }) {
  return (
    <div className={`msg msg-${msg.role}`}>
      {msg.blocks.map((b, i) => {
        if (b.kind === "text") return <Markdown key={i} remarkPlugins={[remarkGfm]}>{b.text}</Markdown>;
        if (b.kind === "thinking") return <pre key={i} className="thinking">{b.text}</pre>;
        if (b.kind === "toolCall")
          return <details key={i} className="tool"><summary>{b.name}</summary><pre>{JSON.stringify(b.args, null, 2)}</pre></details>;
        return <details key={i} className={`tool ${b.isError ? "tool-error" : ""}`}><summary>{b.toolName} result</summary><pre>{b.text}</pre></details>;
      })}
    </div>
  );
}
