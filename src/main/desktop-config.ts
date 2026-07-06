import { app } from "electron";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

const configPath = join(app.getPath("userData"), "pi-desktop-config.json");

interface DesktopConfig {
  systemPrompt?: string;
}

async function read(): Promise<DesktopConfig> {
  try {
    return JSON.parse(await readFile(configPath, "utf-8"));
  } catch {
    return {};
  }
}

async function write(cfg: DesktopConfig): Promise<void> {
  await writeFile(configPath, JSON.stringify(cfg, null, 2), "utf-8");
}

export async function getDesktopConfig(): Promise<DesktopConfig> {
  return read();
}

export async function updateDesktopConfig(partial: Partial<DesktopConfig>): Promise<DesktopConfig> {
  const cfg = await read();
  const merged = { ...cfg, ...partial };
  await write(merged);
  invalidateSessionArgsCache();
  return merged;
}

// ponytail: cached config args, invalidated on update
let cachedArgs: string[] | null = null;

function invalidateSessionArgsCache(): void {
  cachedArgs = null;
}

/** Build extra CLI args to pass to new pi sessions from desktop config. */
export async function getSessionArgs(): Promise<string[]> {
  if (cachedArgs !== null) return cachedArgs;
  const cfg = await read();
  const args: string[] = [];
  if (cfg.systemPrompt?.trim()) {
    args.push("--append-system-prompt", cfg.systemPrompt.trim());
  }
  cachedArgs = args;
  return args;
}
