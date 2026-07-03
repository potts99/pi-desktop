import { app } from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const file = () => join(app.getPath("userData"), "workspaces.json");

export function listWorkspaces(): string[] {
  try {
    if (!existsSync(file())) return [];
    return JSON.parse(readFileSync(file(), "utf8")) as string[];
  } catch {
    return [];
  }
}

export function addWorkspace(path: string): string[] {
  const cur = listWorkspaces();
  if (!cur.includes(path)) cur.push(path);
  writeFileSync(file(), JSON.stringify(cur, null, 2));
  return cur;
}
