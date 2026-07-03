import { watch, type FSWatcher } from "node:fs";
import { dirname } from "node:path";
import { SessionManager, type SessionInfo } from "@earendil-works/pi-coding-agent";
import { toSessionRows } from "../shared/view-model.ts";
import type { SessionRow } from "../shared/types.ts";

export async function listSessions(cwd: string): Promise<SessionRow[]> {
  const infos = await SessionManager.list(cwd);
  return toSessionRows(infos);
}

// The session dir is the parent of any session file; we get one from list()
// rather than reconstructing pi's internal path encoding.
export async function sessionDirFor(cwd: string): Promise<string | null> {
  const infos: SessionInfo[] = await SessionManager.list(cwd);
  return infos[0] ? dirname(infos[0].path) : null;
}

export function watchDir(dir: string, onChange: () => void): FSWatcher | null {
  try {
    return watch(dir, { persistent: false }, () => onChange());
  } catch {
    return null; // dir may not exist yet; caller retries on next listSessions
  }
}
