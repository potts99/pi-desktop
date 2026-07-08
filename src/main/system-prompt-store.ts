import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const systemPromptPath = join(homedir(), ".pi", "agent", "SYSTEM.md");

export async function getSystemPrompt(): Promise<string> {
  try {
    return await readFile(systemPromptPath, "utf-8");
  } catch {
    return "";
  }
}

export async function updateSystemPrompt(systemPrompt: string): Promise<string> {
  const trimmedSystemPrompt = systemPrompt.trim();
  if (!trimmedSystemPrompt) {
    await rm(systemPromptPath, { force: true });
    return "";
  }

  await mkdir(dirname(systemPromptPath), { recursive: true });
  await writeFile(systemPromptPath, `${trimmedSystemPrompt}\n`, "utf-8");
  return trimmedSystemPrompt;
}
