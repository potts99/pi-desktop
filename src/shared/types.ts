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
  | { kind: "toolResult"; toolCallId: string; toolName: string; text: string; isError: boolean };

export interface TranscriptMessage {
  role: "user" | "assistant" | "tool";
  blocks: Block[];
}

export interface ModelChoice {
  provider: string;
  id: string;
}

// Events pushed main -> renderer for an open session.
// (Initial history is returned synchronously from openSession, not via an event.)
export type SessionEvent =
  | { kind: "assistantDelta"; text: string }           // streamed text
  | { kind: "message"; message: TranscriptMessage }    // a completed message
  | { kind: "idle" }                                   // agent_end
  | { kind: "error"; message: string };

export interface Api {
  listWorkspaces(): Promise<string[]>;
  addWorkspace(): Promise<string[]>;                    // opens folder picker, returns new list
  listSessions(workspacePath: string): Promise<SessionRow[]>;
  openSession(arg: { path: string } | { newIn: string }): Promise<{ sessionKey: string; messages: TranscriptMessage[] }>;
  closeSession(sessionKey: string): Promise<void>;
  sendPrompt(sessionKey: string, text: string): Promise<void>;
  getModels(sessionKey: string): Promise<ModelChoice[]>;
  setModel(sessionKey: string, provider: string, id: string): Promise<void>;
  onSessionEvent(cb: (sessionKey: string, ev: SessionEvent) => void): () => void;
  onSessionsChanged(cb: (workspacePath: string) => void): () => void;
}
