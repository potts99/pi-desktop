import { useEffect, useRef, useState, useCallback } from "react";
import type { TranscriptMessage } from "../../shared/types.ts";
import { MessageBlocks } from "./MessageBlocks.tsx";

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

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
      <WorkIndicator active={streaming} />
    </div>
  );
}

function WorkIndicator({ active }: { active: boolean }) {
  const [phase, setPhase] = useState<"idle" | "active" | "done">("idle");
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (active) {
      setPhase("active");
    } else if (phase === "active") {
      setPhase("done");
      const t = setTimeout(() => setPhase("idle"), 1500);
      return () => clearTimeout(t);
    }
  }, [active]);

  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length), 80);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === "idle") return null;

  const char = phase === "done" ? "✓" : BRAILLE_FRAMES[frame];
  const text = phase === "done" ? "Done" : "Working";

  return (
    <div className="msg-wrap">
      <div className="msg">
        <span className="pi-spinner" style={{ display: "inline" }}>{char}</span> {text}
      </div>
    </div>
  );
}
