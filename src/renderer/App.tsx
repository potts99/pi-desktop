import { useEffect, useState, useCallback } from "react";
import "./styles/glass.css";
import { useSessions } from "./state/useSessions.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { Transcript } from "./components/Transcript.tsx";
import { InputBar } from "./components/InputBar.tsx";
import {
	CommandPalette,
	type PaletteCommand,
} from "./components/CommandPalette.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { MetricsDashboard } from "./components/MetricsDashboard.tsx";

const commands: PaletteCommand[] = [
	{
		id: "newAgent",
		label: "New Agent",
		description: "Open a new agent tab",
		shortcut: "\u2318N",
	},
	{
		id: "closeTab",
		label: "Close Tab",
		description: "Close the current tab",
		shortcut: "\u2318W",
	},
	{
		id: "nextTab",
		label: "Next Tab",
		description: "Switch to the next tab",
		shortcut: "\u2318\u21E7]",
	},
	{
		id: "prevTab",
		label: "Previous Tab",
		description: "Switch to the previous tab",
		shortcut: "\u2318\u21E7[",
	},
	{
		id: "focusInput",
		label: "Focus Input",
		description: "Focus the chat input",
		shortcut: "\u2318L",
	},
	{
		id: "rename",
		label: "Rename Agent",
		description: "Rename the current agent session",
	},
	{
		id: "clone",
		label: "Clone Agent",
		description: "Clone the current agent session",
	},
	{
		id: "deleteAgent",
		label: "Delete Agent",
		description: "Delete the current agent session",
	},
	{
		id: "closeWindow",
		label: "Close Window",
		description: "Close the pi window",
		shortcut: "\u2318W",
	},
	{
		id: "minimize",
		label: "Minimize",
		description: "Minimize the window",
		shortcut: "\u2318M",
	},
	{
		id: "openSettings",
		label: "Open Settings",
		description: "Configure pi settings",
		shortcut: "\u2318,",
	},
	{
		id: "openMetrics",
		label: "Open Metrics",
		description: "View local usage metrics",
	},
	{
		id: "toggleSidebar",
		label: "Toggle Sidebar",
		description: "Show or hide the sidebar",
		shortcut: "\u2318B",
	},
];

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function PISpinner() {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const id = setInterval(
			() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length),
			80,
		);
		return () => clearInterval(id);
	}, []);
	return <span className="pi-spinner">{BRAILLE_FRAMES[frame]}</span>;
}

function compactNumber(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value))
		return "--";
	const abs = Math.abs(value);
	if (abs >= 1_000_000)
		return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
	if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
	return String(Math.round(value));
}

function contextText(stats: ReturnType<typeof useSessions>["stats"]): string {
	const usage = stats?.contextUsage;
	if (!usage) return "CH --";
	const percent =
		usage.percent === null ? "--" : `${usage.percent.toFixed(1)}%`;
	const windowSize = compactNumber(usage.contextWindow);
	return `CH ${percent}/${windowSize} (auto)`;
}

export default function App() {
	const s = useSessions();
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [metricsOpen, setMetricsOpen] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [pinnedPaths, setPinnedPaths] = useState<string[]>([]);
	const [vscodeAvailable, setVscodeAvailable] = useState(false);
	const [maximized, setMaximized] = useState(false);

	useEffect(() => {
		const check = async () => {
			try {
				const [m, f] = await Promise.all([
					window.pi?.isMaximized(),
					window.pi?.isFullScreen(),
				]);
				setMaximized(!!(m || f));
			} catch {
				/* window state unavailable */
			}
		};
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	useEffect(() => {
		window.pi
			?.getPinned()
			.then(setPinnedPaths)
			.catch(() => {});
	}, []);
	useEffect(() => {
		window.pi
			?.isVSCodeAvailable()
			.then(setVscodeAvailable)
			.catch(() => {});
	}, []);

	const togglePin = useCallback((path: string) => {
		window.pi
			?.togglePin(path)
			.then(setPinnedPaths)
			.catch(() => {});
	}, []);

	const rename = useCallback(() => {
		const name = window.prompt("Session name", s.activeTitle ?? "");
		if (name) void s.rename(name);
	}, [s]);

	const remove = useCallback(() => {
		if (window.confirm("Delete this session?")) void s.remove();
	}, [s]);

	const executeCommand = useCallback(
		(id: string) => {
			switch (id) {
				case "newAgent":
					void s.newAgent();
					break;
				case "closeTab":
					s.closeTab(s.activeIdx);
					break;
				case "nextTab":
					s.nextTab();
					break;
				case "prevTab":
					s.prevTab();
					break;
				case "focusInput":
					document
						.querySelector<HTMLTextAreaElement>(".composer textarea")
						?.focus();
					break;
				case "rename":
					rename();
					break;
				case "clone":
					void s.clone();
					break;
				case "deleteAgent":
					remove();
					break;
				case "closeWindow":
					void window.pi?.closeWindow();
					break;
				case "minimize":
					void window.pi?.minimizeWindow();
					break;
				case "toggleSidebar":
					setSidebarOpen((v) => !v);
					break;
				case "openSettings":
					setMetricsOpen(false);
					setSettingsOpen(true);
					break;
				case "openMetrics":
					setSettingsOpen(false);
					setMetricsOpen(true);
					break;
			}
		},
		[s, rename, remove],
	);

	// Keyboard shortcuts
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;
			if (e.key === "k" && mod) {
				e.preventDefault();
				setPaletteOpen((o) => !o);
				return;
			}
			if (paletteOpen) return; // Don't handle other shortcuts when palette is open
			if (!mod) return;
			if (e.key === "n" && !e.shiftKey) {
				e.preventDefault();
				void s.newAgent();
			} else if (e.key === "w") {
				e.preventDefault();
				s.closeTab(s.activeIdx);
			} else if (e.key === "b") {
				e.preventDefault();
				setSidebarOpen((v) => !v);
			} else if (e.key === "]" && e.shiftKey) {
				e.preventDefault();
				s.nextTab();
			} else if (e.key === "[" && e.shiftKey) {
				e.preventDefault();
				s.prevTab();
			}
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [s, paletteOpen]);

	return (
		<>
			{settingsOpen ? (
				<SettingsPanel
					onClose={() => setSettingsOpen(false)}
					activeSessionKey={s.activeKey ?? undefined}
				/>
			) : metricsOpen ? (
				<MetricsDashboard onClose={() => setMetricsOpen(false)} />
			) : (
				<div
					className={`app${sidebarOpen ? "" : " no-sidebar"}${maximized ? " maximized" : ""}`}
				>
					{sidebarOpen && (
						<Sidebar
							groups={s.groups}
							activePath={s.activePath}
							pinnedPaths={pinnedPaths}
							streamingPaths={
								new Set(
									s.tabs
										.filter((t) => t.streaming)
										.map((t) => t.sessionPath)
										.filter(Boolean) as string[],
								)
							}
							onNewAgent={s.newAgent}
							onAddWorkspace={s.addWorkspace}
							onRemoveWorkspace={s.removeWorkspace}
							onOpen={(path) => s.openSession({ path })}
							onNew={s.startNewThread}
							onTogglePin={togglePin}
							onOpenSettings={() => {
								setMetricsOpen(false);
								setSettingsOpen(true);
							}}
							onOpenMetrics={() => {
								setSettingsOpen(false);
								setMetricsOpen(true);
							}}
						/>
					)}
					<div className={`main-pane${s.newThread ? " new-thread-pane" : ""}`}>
						<div
							className="topbar"
							onDoubleClick={async () => {
								const m = await window.pi.isMaximized();
								m ? window.pi.unmaximizeWindow() : window.pi.maximizeWindow();
							}}
						>
							<div className="top-actions">
								<button
									onClick={() => setSidebarOpen((v) => !v)}
									title="Toggle sidebar (\u2318B)"
								>
									{sidebarOpen ? "«" : "»"}
								</button>
							</div>
							{s.activeKey && s.activeTitle && (
								<span
									className="topbar-title"
									onClick={() => setSidebarOpen((v) => !v)}
									title="Toggle sidebar (\u2318B)"
								>
									{s.activeTitle}
								</span>
							)}
							{s.activeKey && (
								<div className="topbar-right">
									{vscodeAvailable && (
										<button
											className="vscode-btn"
											title="Open workspace in VS Code"
											onClick={() => {
												const cwd = s.groups.find((g) =>
													g.sessions.some((r) => r.path === s.activePath),
												)?.path;
												if (cwd) void window.pi?.openInVSCode(cwd);
											}}
										>
											VS Code
										</button>
									)}
									<span className="session-stats">
										<span>↑{compactNumber(s.stats?.tokens.input)}</span>
										<span>↓{compactNumber(s.stats?.tokens.output)}</span>
										<span>R{compactNumber(s.stats?.tokens.cacheRead)}</span>
										<span>W{compactNumber(s.stats?.tokens.cacheWrite)}</span>
										<span className="stat-cost">
											${(s.stats?.cost ?? 0).toFixed(4)}
										</span>
										<span className="stat-context">{contextText(s.stats)}</span>
									</span>
								</div>
							)}
						</div>
						{s.newThread && s.error && (
							<div className={`status-banner ${s.error ? "status-error" : ""}`}>
								<span>{s.error}</span>
								<button onClick={s.clearError}>Dismiss</button>
							</div>
						)}
						{s.newThread ? (
							<div className="new-thread-state">
								<InputBar
									centered
									disabled={!s.newThreadCwd}
									streaming={false}
									models={s.models}
									activeModel={s.activeModel}
									cwd={s.newThreadCwd}
									thinkingLevel={s.thinkingLevel}
									thinkingLevels={s.thinkingLevels}
									workspaces={s.groups}
									selectedWorkspace={s.newThreadCwd ?? ""}
									branches={s.newThreadBranches}
									selectedBranch={s.newThreadBranch}
									onWorkspace={s.setNewThreadCwd}
									onBranch={s.setNewThreadBranch}
									onSend={s.send}
									onStop={s.abort}
									onModel={s.setModel}
									onThinking={s.setThinkingLevel}
									onCycleThinking={s.cycleThinking}
								/>
							</div>
						) : s.opening ? (
							<div className="empty-state">
								<PISpinner />
								<div className="empty-sub">Opening agent…</div>
							</div>
						) : s.activeKey ? (
							<Transcript
								messages={s.messages}
								streamingText={s.streamingText}
								streaming={s.streaming}
								workingStartedAt={s.workingStartedAt}
								uiRequests={s.uiRequests}
								activeModel={s.activeModel}
								advisorReviewing={s.advisorReviewing}
								advisorModel={s.advisorModel}
								error={s.error}
								retry={s.retry}
								onRetry={s.retryLast}
								onDismissError={s.clearError}
								onRespondToUiRequest={s.respondToUiRequest}
								onFork={s.fork}
							/>
						) : (
							<div className="empty-state">
								<div className="empty-title">pi</div>
								<div className="empty-sub">
									Pick an agent on the left, or start a New Agent.
								</div>
							</div>
						)}
						{!s.newThread && (
							<InputBar
								disabled={!s.activeKey}
								streaming={s.streaming}
								models={s.models}
								activeModel={s.activeModel}
								cwd={s.activeCwd}
								thinkingLevel={s.thinkingLevel}
								thinkingLevels={s.thinkingLevels}
								queue={s.queue}
								pending={s.pending}
								onSend={s.send}
								onStop={s.abort}
								onQueuePending={s.queuePending}
								onPushPending={s.pushPending}
								onRemovePending={s.removePending}
								onModel={s.setModel}
								onThinking={s.setThinkingLevel}
								onCycleThinking={s.cycleThinking}
							/>
						)}
					</div>
				</div>
			)}
			<CommandPalette
				open={paletteOpen}
				commands={commands}
				onClose={() => setPaletteOpen(false)}
				onExecute={executeCommand}
			/>
		</>
	);
}
