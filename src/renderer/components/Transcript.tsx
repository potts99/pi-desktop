import { useEffect, useRef, useState, useCallback } from "react";
import type { TranscriptMessage } from "../../shared/types.ts";
import { MessageBlocks } from "./MessageBlocks.tsx";

export function Transcript({
  messages = [],
  streamingText,
  streaming = false,
  onFork,
}: {
  messages?: TranscriptMessage[];
  streamingText: string;
  streaming?: boolean;
  onFork: (entryId: string) => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const onScroll = useCallback(() => {
    const el = container.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolledUp(!atBottom);
  }, []);

  useEffect(() => {
    if (!userScrolledUp) end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, userScrolledUp]);

  return (
    <div className="transcript" ref={container} onScroll={onScroll}>
      {messages.map((m, i) => <MessageBlocks key={m.id ?? i} msg={m} onFork={onFork} />)}
      {streamingText && (
        <MessageBlocks isStreaming msg={{ role: "assistant", blocks: [{ kind: "text", text: streamingText }] }} />
      )}
      <div ref={end} />
    </div>
  );
}
