// Sidebar view model produced by view-model.ts
export interface SessionRow {
  path: string;
  id: string;
  title: string;        // name || firstMessage || "New session"
  subtitle: string;     // relative time string
  modifiedMs: number;
  messageCount: number;
}

export interface WorkspaceGroup {
  path: string;         // workspace cwd
  name: string;         // basename of path
  sessions: SessionRow[];
}

// A transcript entry the renderer knows how to draw.
export type Block =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "toolCall"; id: string; name: string; args: unknown }
  | { kind: "toolResult"; toolCallId: string; toolName: string; text: string; isError: boolean; diff?: string };

export interface TranscriptMessage {
  id?: string;
  role: "user" | "assistant" | "tool";
  blocks: Block[];
}

export interface ModelChoice {
  provider: string;
  id: string;
}

export type AgentMode = "normal" | "agent" | "yolo" | "manual";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface QueueState {
  steering: string[];
  followUp: string[];
}

export interface RetryState {
  active: boolean;
  attempt?: number;
  maxAttempts?: number;
  delayMs?: number;
  message?: string;
}

export interface SessionState {
  sessionPath?: string;
  thinkingLevel: ThinkingLevel;
  mode: AgentMode;
  isStreaming: boolean;
  queue: QueueState;
  model?: { provider: string; id: string };
}
export interface SessionReplacement {
  cancelled: boolean;
  sessionPath?: string;
  messages: TranscriptMessage[];
  thinkingLevel: ThinkingLevel;
  mode: AgentMode;
}

export interface SessionStatsInfo {
  sessionId: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls?: number;
  toolResults?: number;
  totalMessages: number;
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number; total: number };
  cost?: number;
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
}

/** Per-tab renderer state for each open session. */
export interface TabState {
  sessionKey: string;
  sessionPath: string | null;
  messages: TranscriptMessage[];
  streamingText: string;
  streaming: boolean;
  models: ModelChoice[];
  activeModel: ModelChoice | null;
  thinkingLevel: ThinkingLevel;
  mode: AgentMode;
  queue: QueueState;
  retry: RetryState;
  stats: SessionStatsInfo | null;
  error: string | null;
}

// Events pushed main -> renderer for an open session.
// (Initial history is returned synchronously from openSession, not via an event.)
export type SessionEvent =
  | { kind: "assistantDelta"; text: string }           // streamed text
  | { kind: "message"; message: TranscriptMessage }    // a completed message
  | { kind: "idle" }                                   // agent_end
  | { kind: "queue"; queue: QueueState }
  | { kind: "retry"; retry: RetryState }
  | { kind: "sessionState"; state: Partial<SessionState> }
  | { kind: "error"; message: string };

export interface Api {
  listWorkspaces(): Promise<string[]>;
  addWorkspace(): Promise<string[]>;                    // opens folder picker, returns new list
  removeWorkspace(path: string): Promise<string[]>;     // removes workspace, returns new list
  listSessions(workspacePath: string): Promise<SessionRow[]>;
  listWorkspaceFiles(cwd: string, prefix: string): Promise<string[]>;
  openSession(arg: { path: string } | { newIn: string }): Promise<{ sessionKey: string; messages: TranscriptMessage[]; state: SessionState }>;
  closeSession(sessionKey: string): Promise<void>;
  sendPrompt(sessionKey: string, text: string, mode?: "prompt" | "steer" | "followUp"): Promise<void>;
  abortSession(sessionKey: string): Promise<void>;
  getModels(sessionKey: string): Promise<ModelChoice[]>;
  getSharedModels(sessionKey?: string): Promise<ModelChoice[]>;
  setModel(sessionKey: string, provider: string, id: string): Promise<void>;
  getSessionState(sessionKey: string): Promise<SessionState>;
  setMode(sessionKey: string, mode: AgentMode): Promise<AgentMode>;
  setThinkingLevel(sessionKey: string, level: ThinkingLevel): Promise<ThinkingLevel>;
  cycleThinkingLevel(sessionKey: string): Promise<ThinkingLevel | null>;
  forkSession(sessionKey: string, entryId: string): Promise<SessionReplacement>;
  cloneSession(sessionKey: string): Promise<SessionReplacement>;
  renameSession(sessionKey: string, name: string): Promise<void>;
  deleteSession(sessionPath: string): Promise<void>;
  getSessionStats(sessionKey: string): Promise<SessionStatsInfo>;
  getLastAssistantText(sessionKey: string): Promise<string | null>;
  // window controls
  closeWindow(): Promise<void>;
  maximizeWindow(): Promise<void>;
  minimizeWindow(): Promise<void>;
  unmaximizeWindow(): Promise<void>;
  getPinned(): Promise<string[]>;
  getSettings(): Promise<Record<string, unknown>>;
  getDesktopConfig(): Promise<Record<string, unknown>>;
  updateDesktopConfig(partial: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateSettings(partial: Record<string, unknown>): Promise<Record<string, unknown>>;
  togglePin(sessionPath: string): Promise<string[]>;
  isMaximized(): Promise<boolean>;
  isFullScreen(): Promise<boolean>;
  openInVSCode(path: string): Promise<void>;
  isVSCodeAvailable(): Promise<boolean>;
  onSessionEvent(cb: (sessionKey: string, ev: SessionEvent) => void): () => void;
  onSessionsChanged(cb: (workspacePath: string) => void): () => void;
}
