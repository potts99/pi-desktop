import { describe, it, expect } from "vitest";
import { toSessionRows, relativeTime } from "./view-model.ts";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";

function info(over: Partial<SessionInfo>): SessionInfo {
  return {
    path: "/s/a.jsonl", id: "a", cwd: "/proj", name: undefined,
    created: new Date(0), modified: new Date(0),
    messageCount: 1, firstMessage: "hi", allMessagesText: "hi", ...over,
  };
}

describe("toSessionRows", () => {
  it("sorts by modified desc and derives title from name > firstMessage", () => {
    const rows = toSessionRows(
      [
        info({ id: "old", modified: new Date(1000), firstMessage: "older" }),
        info({ id: "new", modified: new Date(5000), name: "My work" }),
      ],
      new Date(10000),
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[0].title).toBe("My work");
    expect(rows[1].title).toBe("older");
  });

  it("falls back to 'New session' when empty and truncates long titles", () => {
    const long = "x".repeat(200);
    const rows = toSessionRows(
      [info({ id: "empty", firstMessage: "", name: undefined }),
       info({ id: "long", firstMessage: long })],
      new Date(10000),
    );
    const empty = rows.find((r) => r.id === "empty")!;
    const lng = rows.find((r) => r.id === "long")!;
    expect(empty.title).toBe("New session");
    expect(lng.title.length).toBeLessThanOrEqual(80);
  });
});

describe("relativeTime", () => {
  it("formats recent as minutes/hours and old as days", () => {
    const now = new Date(1_000_000_000_000);
    expect(relativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe("5m");
    expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3h");
    expect(relativeTime(new Date(now.getTime() - 2 * 86_400_000), now)).toBe("2d");
  });
});
