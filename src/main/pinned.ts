import { app } from "electron";
import { join } from "node:path";
import { readFile, writeFile, access } from "node:fs/promises";

const pinFile = join(app.getPath("userData"), "pinned-agents.json");

async function readPins(): Promise<string[]> {
  try {
    const data = await readFile(pinFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writePins(paths: string[]): Promise<void> {
  await writeFile(pinFile, JSON.stringify(paths), "utf-8");
}

export async function getPinned(): Promise<string[]> {
  return readPins();
}

export async function togglePin(sessionPath: string): Promise<string[]> {
  const pins = await readPins();
  const idx = pins.indexOf(sessionPath);
  if (idx >= 0) pins.splice(idx, 1);
  else pins.push(sessionPath);
  await writePins(pins);
  return pins;
}
