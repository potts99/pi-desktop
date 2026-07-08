import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AdvisorConfig } from "../shared/types.ts";

const advisorConfigPath = join(homedir(), ".pi", "agent", "pi-desktop-advisor.json");

const defaultAdvisorConfig: AdvisorConfig = {
  enabled: false,
  model: null,
  thinkingLevel: "medium",
  instructions: "",
  maxConsecutive: 3,
};

function normalizeAdvisorConfig(value: Partial<AdvisorConfig>): AdvisorConfig {
  return {
    enabled: value.enabled ?? defaultAdvisorConfig.enabled,
    model: value.model ?? defaultAdvisorConfig.model,
    thinkingLevel: value.thinkingLevel ?? defaultAdvisorConfig.thinkingLevel,
    instructions: value.instructions ?? defaultAdvisorConfig.instructions,
    maxConsecutive: Math.max(1, Math.floor(value.maxConsecutive ?? defaultAdvisorConfig.maxConsecutive)),
  };
}

export async function getAdvisorConfig(): Promise<AdvisorConfig> {
  try {
    return normalizeAdvisorConfig(JSON.parse(await readFile(advisorConfigPath, "utf-8")) as Partial<AdvisorConfig>);
  } catch {
    return defaultAdvisorConfig;
  }
}

export async function updateAdvisorConfig(partial: Partial<AdvisorConfig>): Promise<AdvisorConfig> {
  const current = await getAdvisorConfig();
  const merged = normalizeAdvisorConfig({ ...current, ...partial });
  await mkdir(dirname(advisorConfigPath), { recursive: true });
  await writeFile(advisorConfigPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}
