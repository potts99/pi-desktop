import { useEffect, useRef } from "react";
import type { TranscriptMessage } from "../../shared/types.ts";
import { MessageBlocks } from "./MessageBlocks.tsx";

export function Transcript({
  messages = [],
  streamingText,
  onFork,
}: {
  messages?: TranscriptMessage[];
  streamingText: string;
  onFork: (entryId: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages, streamingText]);
  return (
    <div className="transcript">
      {messages.map((m, i) => <MessageBlocks key={m.id ?? i} msg={m} onFork={onFork} />)}
      {streamingText && (
        <MessageBlocks msg={{ role: "assistant", blocks: [{ kind: "text", text: streamingText }] }} />
      )}
      <div ref={end} />
    </div>
  );
}
