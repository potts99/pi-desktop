import { useEffect, useRef } from "react";
import type { TranscriptMessage } from "../../shared/types.ts";
import { MessageBlocks } from "./MessageBlocks.tsx";

export function Transcript({ messages }: { messages: TranscriptMessage[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
  return (
    <div className="transcript">
      {messages.map((m, i) => <MessageBlocks key={i} msg={m} />)}
      <div ref={end} />
    </div>
  );
}
