import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import type { SessionRow } from "./types.ts";

const MAX_TITLE = 80;

export function relativeTime(when: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - when.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function title(s: SessionInfo): string {
  const raw = (s.name?.trim() || s.firstMessage?.trim() || "") as string;
  if (!raw) return "New session";
  return raw.length > MAX_TITLE ? raw.slice(0, MAX_TITLE - 1) + "…" : raw;
}

export function toSessionRows(sessions: SessionInfo[], now: Date = new Date()): SessionRow[] {
  return sessions
    .slice()
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .map((s) => ({
      path: s.path,
      id: s.id,
      title: title(s),
      subtitle: relativeTime(s.modified, now),
      modifiedMs: s.modified.getTime(),
      messageCount: s.messageCount,
    }));
}
