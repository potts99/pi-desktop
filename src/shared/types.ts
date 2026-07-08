// Sidebar view model produced by view-model.ts
export interface SessionRow {
	path: string;
	id: string;
	title: string; // name || firstMessage || "New session"
	subtitle: string; // relative time string
	modifiedMs: number;
	messageCount: number;
}

export interface WorkspaceGroup {
	path: string; // workspace cwd
	name: string; // basename of path
	sessions: SessionRow[];
}

// A transcript entry the renderer knows how to draw.
export type Block =
	| { kind: "text"; text: string }
	| { kind: "thinking"; text: string }
	| { kind: "error"; text: string }
	| { kind: "toolCall"; id: string; name: string; args: unknown }
	| {
			kind: "toolResult";
			toolCallId: string;
			toolName: string;
			text: string;
			isError: boolean;
			diff?: string;
	  };

export interface TranscriptMessage {
	id?: string;
	role: "user" | "assistant" | "tool";
	blocks: Block[];
}

export interface ModelChoice {
	provider: string;
	id: string;
}

export interface GitBranchInfo {
	current: string | null;
	branches: string[];
}

export type AgentMode = "normal" | "agent" | "yolo" | "manual";

export type ThinkingLevel =
	| "off"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export interface AdvisorConfig {
	enabled: boolean;
	model: ModelChoice | null;
	thinkingLevel: ThinkingLevel;
	instructions: string;
	maxConsecutive: number;
}

export interface QueueState {
	steering: string[];
	followUp: string[];
}

export interface SlashCommand {
	id: string;
	label: string;
	description: string;
}

export interface RetryState {
	active: boolean;
	attempt?: number;
	maxAttempts?: number;
	delayMs?: number;
	message?: string;
}

export type SessionUiRequest =
	| {
			id: string;
			method: "select";
			title: string;
			options: string[];
			timeout?: number;
	  }
	| {
			id: string;
			method: "confirm";
			title: string;
			message: string;
			timeout?: number;
	  }
	| {
			id: string;
			method: "input";
			title: string;
			placeholder?: string;
			timeout?: number;
	  }
	| {
			id: string;
			method: "editor";
			title: string;
			prefill?: string;
	  }
	| {
			id: string;
			method: "notify";
			message: string;
			notifyType?: "info" | "warning" | "error";
	  }
	| {
			id: string;
			method: "setStatus";
			statusKey: string;
			statusText: string | undefined;
	  }
	| {
			id: string;
			method: "setWidget";
			widgetKey: string;
			widgetLines: string[] | undefined;
			widgetPlacement?: "aboveEditor" | "belowEditor";
	  }
	| { id: string; method: "setTitle"; title: string }
	| { id: string; method: "set_editor_text"; text: string };

export type SessionUiResponse =
	| { id: string; value: string }
	| { id: string; confirmed: boolean }
	| { id: string; cancelled: true };

export type WorkActivityStatus = "active" | "waiting" | "done" | "error";

export interface WorkActivityItem {
	id: string;
	label: string;
	detail?: string;
	status: WorkActivityStatus;
}

export interface SessionState {
	sessionPath?: string;
	thinkingLevel: ThinkingLevel;
	mode: AgentMode;
	isStreaming: boolean;
	queue: QueueState;
	model?: { provider: string; id: string };
	/** Epoch ms when the current streaming turn started, or null when idle. */
	workingStartedAt?: number | null;
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
	tokens: {
		input: number;
		output: number;
		cacheRead?: number;
		cacheWrite?: number;
		total: number;
	};
	cost?: number;
	contextUsage?: {
		tokens: number | null;
		contextWindow: number;
		percent: number | null;
	};
}

export type MetricsActor = "worker" | "advisor";
export type MetricsSource = "observed" | "backfill";
export type MetricsRunStatus = "completed" | "aborted" | "error";
export type MetricsAdvisorSeverity = "none" | "nit" | "concern" | "blocker";
export type MetricsAdvisorAction = "none" | "followUp" | "steer" | "prompt";

export interface MetricsTokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	reasoning: number;
	total: number;
}

export interface MetricsRunRecord {
	id: string;
	source: MetricsSource;
	actor: MetricsActor;
	status: MetricsRunStatus;
	projectPath: string;
	sessionPath?: string;
	sessionId?: string;
	startedAt: string;
	endedAt: string;
	day: string;
	modelKey: string;
	provider?: string;
	modelId?: string;
	thinkingLevel?: ThinkingLevel;
	mode?: AgentMode;
	requestMode?: "prompt" | "steer" | "followUp";
	durationMs: number | null;
	tps: number | null;
	tokens: MetricsTokenUsage;
	cost: number;
	toolCalls: number;
	toolResults: number;
	advisorSeverity?: MetricsAdvisorSeverity;
	advisorAction?: MetricsAdvisorAction;
}

export interface MetricsFilter {
	from?: string;
	to?: string;
	projectPath?: string;
	modelKey?: string;
	actor?: MetricsActor;
}

export interface MetricsTotals {
	runs: number;
	cost: number;
	tokens: MetricsTokenUsage;
	averageTps: number | null;
	tpsSamples: number;
	activeProjects: number;
	advisorReviews: number;
	advisorInterventions: number;
}

export interface MetricsDailyBucket {
	day: string;
	runs: number;
	cost: number;
	tokens: MetricsTokenUsage;
	averageTps: number | null;
}

export interface MetricsProjectRow {
	projectPath: string;
	projectName: string;
	runs: number;
	cost: number;
	tokens: MetricsTokenUsage;
	averageTps: number | null;
	topModelKey: string;
	lastUsedAt: string;
}

export interface MetricsModelRow {
	modelKey: string;
	runs: number;
	cost: number;
	tokens: MetricsTokenUsage;
	averageTps: number | null;
	lastUsedAt: string;
}

export interface MetricsAdvisorRow {
	modelKey: string;
	reviews: number;
	interventions: number;
	cost: number;
	tokens: MetricsTokenUsage;
	averageDurationMs: number | null;
	severityCounts: Record<MetricsAdvisorSeverity, number>;
	lastUsedAt: string;
}

export interface MetricsHeatmapCell {
	day: string;
	level: number;
	runs: number;
	cost: number;
	tokens: MetricsTokenUsage;
}

export interface MetricsSummary {
	filter: MetricsFilter;
	availableProjects: string[];
	availableModels: string[];
	generatedAt: string;
	totals: MetricsTotals;
	dailyBuckets: MetricsDailyBucket[];
	heatmapCells: MetricsHeatmapCell[];
	projectRows: MetricsProjectRow[];
	modelRows: MetricsModelRow[];
	advisorRows: MetricsAdvisorRow[];
	records: MetricsRunRecord[];
}

/** Per-tab renderer state for each open session. */
export interface TabState {
	sessionKey: string;
	sessionPath: string | null;
	cwd: string | null;
	messages: TranscriptMessage[];
	streamingText: string;
	streaming: boolean;
	advisorReviewing: boolean;
	models: ModelChoice[];
	activeModel: ModelChoice | null;
	thinkingLevel: ThinkingLevel;
	mode: AgentMode;
	queue: QueueState;
	pending: string[];
	retry: RetryState;
	stats: SessionStatsInfo | null;
	error: string | null;
	workingStartedAt: number | null;
	uiRequests: SessionUiRequest[];
}

// Events pushed main -> renderer for an open session.
// (Initial history is returned synchronously from openSession, not via an event.)
export type SessionEvent =
	| { kind: "assistantDelta"; text: string } // streamed text
	| { kind: "message"; message: TranscriptMessage } // a completed message
	| { kind: "idle" } // agent_end
	| { kind: "advisory"; reviewing: boolean } // advisor review in progress
	| { kind: "queue"; queue: QueueState }
	| { kind: "retry"; retry: RetryState }
	| { kind: "uiRequest"; request: SessionUiRequest }
	| { kind: "sessionState"; state: Partial<SessionState> }
	| { kind: "error"; message: string };

export interface Api {
	listWorkspaces(): Promise<string[]>;
	addWorkspace(): Promise<string[]>; // opens folder picker, returns new list
	removeWorkspace(path: string): Promise<string[]>; // removes workspace, returns new list
	listSessions(workspacePath: string): Promise<SessionRow[]>;
	listWorkspaceFiles(cwd: string, prefix: string): Promise<string[]>;
	listSlashCommands(cwd: string | null): Promise<SlashCommand[]>;
	listGitBranches(cwd: string): Promise<GitBranchInfo>;
	checkoutGitBranch(cwd: string, branch: string): Promise<void>;
	openSession(
		arg: { path: string; cwd?: string } | { newIn: string },
	): Promise<{
		sessionKey: string;
		messages: TranscriptMessage[];
		state: SessionState;
	}>;
	closeSession(sessionKey: string): Promise<void>;
	sendPrompt(
		sessionKey: string,
		text: string,
		mode?: "prompt" | "steer" | "followUp",
	): Promise<void>;
	abortSession(sessionKey: string): Promise<void>;
	respondToUiRequest(
		sessionKey: string,
		response: SessionUiResponse,
	): Promise<void>;
	getModels(sessionKey: string): Promise<ModelChoice[]>;
	getSharedModels(sessionKey?: string): Promise<ModelChoice[]>;
	setModel(sessionKey: string, provider: string, id: string): Promise<void>;
	getSessionState(sessionKey: string): Promise<SessionState>;
	setMode(sessionKey: string, mode: AgentMode): Promise<AgentMode>;
	setThinkingLevel(
		sessionKey: string,
		level: ThinkingLevel,
	): Promise<ThinkingLevel>;
	cycleThinkingLevel(sessionKey: string): Promise<ThinkingLevel | null>;
	forkSession(sessionKey: string, entryId: string): Promise<SessionReplacement>;
	cloneSession(sessionKey: string): Promise<SessionReplacement>;
	renameSession(sessionKey: string, name: string): Promise<void>;
	deleteSession(sessionPath: string): Promise<void>;
	getSessionStats(sessionKey: string): Promise<SessionStatsInfo>;
	getMetricsSummary(filter?: MetricsFilter): Promise<MetricsSummary>;
	refreshMetricsBackfill(filter?: MetricsFilter): Promise<MetricsSummary>;
	getLastAssistantText(sessionKey: string): Promise<string | null>;
	// window controls
	closeWindow(): Promise<void>;
	maximizeWindow(): Promise<void>;
	minimizeWindow(): Promise<void>;
	unmaximizeWindow(): Promise<void>;
	getPinned(): Promise<string[]>;
	getSettings(): Promise<Record<string, unknown>>;
	getAdvisorConfig(): Promise<AdvisorConfig>;
	updateAdvisorConfig(partial: Partial<AdvisorConfig>): Promise<AdvisorConfig>;
	getSystemPrompt(): Promise<string>;
	updateSystemPrompt(systemPrompt: string): Promise<string>;
	updateSettings(
		partial: Record<string, unknown>,
	): Promise<Record<string, unknown>>;
	togglePin(sessionPath: string): Promise<string[]>;
	isMaximized(): Promise<boolean>;
	isFullScreen(): Promise<boolean>;
	openInVSCode(path: string): Promise<void>;
	isVSCodeAvailable(): Promise<boolean>;
	onSessionEvent(
		cb: (sessionKey: string, ev: SessionEvent) => void,
	): () => void;
	onSessionsChanged(cb: (workspacePath: string) => void): () => void;
}
