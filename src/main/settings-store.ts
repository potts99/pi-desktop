import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, access } from "node:fs/promises";

const globalSettingsPath = join(homedir(), ".pi", "agent", "settings.json");

export interface PiSettings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
  theme?: string;
  lastChangelogVersion?: string;
  transport?: string;
  steeringMode?: string;
  followUpMode?: string;
  compaction?: Record<string, unknown>;
  retry?: Record<string, unknown>;
  hideThinkingBlock?: boolean;
  externalEditor?: string;
  shellPath?: string;
  quietStartup?: boolean;
  defaultProjectTrust?: string;
  shellCommandPrefix?: string;
  npmCommand?: string[];
  collapseChangelog?: boolean;
  enableInstallTelemetry?: boolean;
  enableAnalytics?: boolean;
  trackingId?: string;
  packages?: string[];
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
  enableSkillCommands?: boolean;
  hiddenModels?: string[];
  terminal?: Record<string, unknown>;
  images?: Record<string, unknown>;
  enabledModels?: string[];
  doubleEscapeAction?: string;
  treeFilterMode?: string;
  thinkingBudgets?: Record<string, unknown>;
  editorPaddingX?: number;
  outputPad?: number;
  autocompleteMaxVisible?: number;
  showHardwareCursor?: boolean;
  markdown?: Record<string, unknown>;
  warnings?: Record<string, unknown>;
  sessionDir?: string;
  httpProxy?: string;
  httpIdleTimeoutMs?: number;
  websocketConnectTimeoutMs?: number;
}

export async function getSettings(): Promise<PiSettings> {
  try {
    return JSON.parse(await readFile(globalSettingsPath, "utf-8"));
  } catch {
    return {};
  }
}

export async function updateSettings(partial: Partial<PiSettings>): Promise<PiSettings> {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  for (const key of Object.keys(merged)) {
    if (merged[key as keyof PiSettings] === undefined) {
      delete merged[key as keyof PiSettings];
    }
  }
  await writeFile(globalSettingsPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}
