import { useRef, useState, useCallback, useEffect } from "react";
import type {
	ModelChoice,
	QueueState,
	SlashCommand,
	ThinkingLevel,
	WorkspaceGroup,
} from "../../shared/types.ts";

const maxTextareaHeight = 240;
const emptyQueue: QueueState = { steering: [], followUp: [] };

function modelKey(model: ModelChoice): string {
	return `${model.provider}/${model.id}`;
}

function modelFromKey(value: string): ModelChoice | null {
	const separator = value.indexOf("/");
	if (separator < 1) return null;
	return {
		provider: value.slice(0, separator),
		id: value.slice(separator + 1),
	};
}

export function InputBar({
	disabled,
	streaming,
	models,
	activeModel,
	cwd,
	thinkingLevel,
	thinkingLevels,
	queue = emptyQueue,
	pending = [],
	centered = false,
	workspaces = [],
	selectedWorkspace = "",
	branches = [],
	selectedBranch = "",
	onWorkspace,
	onBranch,
	onSend,
	onStop,
	onQueuePending,
	onPushPending,
	onRemovePending,
	onModel,
	onThinking,
	onCycleThinking,
}: {
	disabled: boolean;
	streaming: boolean;
	models: ModelChoice[];
	activeModel: ModelChoice | null;
	cwd: string | null;
	thinkingLevel: ThinkingLevel;
	thinkingLevels: ThinkingLevel[];
	queue?: QueueState;
	pending?: string[];
	centered?: boolean;
	workspaces?: WorkspaceGroup[];
	selectedWorkspace?: string;
	branches?: string[];
	selectedBranch?: string;
	onWorkspace?: (cwd: string) => void;
	onBranch?: (branch: string) => void;
	onSend: (text: string, mode: "prompt" | "steer" | "followUp") => void;
	onStop: () => void;
	onQueuePending?: (message: string) => void;
	onPushPending?: (index: number) => void;
	onRemovePending?: (index: number) => void;
	onModel: (provider: string, id: string) => void;
	onThinking: (level: ThinkingLevel) => void;
	onCycleThinking: () => void;
}) {
	// File drag-drop
	const [dragOver, setDragOver] = useState(false);
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	};
	const handleDragLeave = () => setDragOver(false);
	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const fileList = e.dataTransfer.files;
		const names: string[] = [];
		for (let i = 0; i < fileList.length; i++) {
			const f = fileList[i];
			// Electron exposes the real path as a non-standard property
			names.push("path" in f ? String(f.path) : f.name);
		}
		const paths = names.join(", ");
		setText((t) => (t ? `${t}\n[Attached: ${paths}]` : `[Attached: ${paths}]`));
	};

	// Paste handler
	const handlePaste = (e: React.ClipboardEvent) => {
		const items = Array.from(e.clipboardData.items);
		const file = items.find((item) => item.kind === "file");
		if (file) {
			e.preventDefault();
			const f = file.getAsFile();
			if (f) {
				setText((t) =>
					t ? `${t}\n[Attached: ${f.name}]` : `[Attached: ${f.name}]`,
				);
			}
		}
	};
	const [text, setText] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const adjustTextareaHeight = useCallback(() => {
		const ta = textareaRef.current;
		if (!ta) return;
		ta.style.height = "auto";
		ta.style.height = `${Math.min(ta.scrollHeight, maxTextareaHeight)}px`;
		ta.style.overflowY =
			ta.scrollHeight > maxTextareaHeight ? "auto" : "hidden";
	}, []);

	useEffect(() => {
		adjustTextareaHeight();
	}, [text, adjustTextareaHeight]);

	const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
	const [slashLoading, setSlashLoading] = useState(false);
	const [slashError, setSlashError] = useState<string | null>(null);
	const [slashActive, setSlashActive] = useState(false);
	const [slashFilter, setSlashFilter] = useState("");
	const [slashIdx, setSlashIdx] = useState(0);
	const [slashStart, setSlashStart] = useState(0);

	useEffect(() => {
		let cancelled = false;
		const fetchSlashCommands = () => {
			if (!window.pi) return;
			setSlashLoading(true);
			setSlashError(null);
			window.pi
				.listSlashCommands(cwd)
				.then((commands) => {
					if (!cancelled) setSlashCommands(commands);
				})
				.catch((error) => {
					if (cancelled) return;
					setSlashCommands([]);
					setSlashError(error instanceof Error ? error.message : String(error));
				})
				.finally(() => {
					if (!cancelled) setSlashLoading(false);
				});
		};
		fetchSlashCommands();
		window.addEventListener("focus", fetchSlashCommands);
		return () => {
			cancelled = true;
			window.removeEventListener("focus", fetchSlashCommands);
		};
	}, [cwd]);

	// @mention state
	const [mentionActive, setMentionActive] = useState(false);
	const [mentionFilter, setMentionFilter] = useState("");
	const [mentionIdx, setMentionIdx] = useState(0);
	const [mentionStart, setMentionStart] = useState(0);
	const [mentionFiles, setMentionFiles] = useState<string[]>([]);
	const [mentionLoading, setMentionLoading] = useState(false);
	const mentionTimer = useRef<ReturnType<typeof setTimeout>>();

	const filteredSlash = slashCommands.filter((c) =>
		c.label.toLowerCase().includes(slashFilter.toLowerCase()),
	);
	const slashEmptyText = slashCommands.length
		? "No matching slash commands"
		: "No skill or prompt commands found";

	const closeSlash = useCallback(() => {
		setSlashActive(false);
		setSlashFilter("");
		setSlashIdx(0);
	}, []);

	const applySlash = useCallback(
		(cmd: SlashCommand) => {
			const before = text.slice(0, slashStart);
			const after = text.slice(
				textareaRef.current?.selectionStart ??
					slashStart + slashFilter.length + 1,
			);
			const newText = `${before}${cmd.label} ${after}`;
			setText(newText);
			closeSlash();
			setTimeout(() => {
				const ta = textareaRef.current;
				if (ta) {
					ta.focus();
					const pos = before.length + cmd.label.length + 1;
					ta.setSelectionRange(pos, pos);
				}
			}, 0);
		},
		[text, slashStart, slashFilter, closeSlash],
	);

	const closeMention = useCallback(() => {
		setMentionActive(false);
		setMentionFilter("");
		setMentionIdx(0);
		setMentionFiles([]);
		if (mentionTimer.current) clearTimeout(mentionTimer.current);
	}, []);

	const fetchMentions = useCallback(
		(prefix: string) => {
			if (!cwd || !window.pi) return;
			setMentionLoading(true);
			if (mentionTimer.current) clearTimeout(mentionTimer.current);
			mentionTimer.current = setTimeout(async () => {
				try {
					const files = await window.pi.listWorkspaceFiles(cwd, prefix);
					setMentionFiles(files);
				} catch {
					setMentionFiles([]);
				} finally {
					setMentionLoading(false);
				}
			}, 100);
		},
		[cwd],
	);

	const applyMention = useCallback(
		(file: string) => {
			const before = text.slice(0, mentionStart);
			const after = text.slice(
				textareaRef.current?.selectionStart ??
					mentionStart + mentionFilter.length + 1,
			);
			const newText = `${before}@${file} ${after}`;
			setText(newText);
			closeMention();
			setTimeout(() => {
				const ta = textareaRef.current;
				if (ta) {
					ta.focus();
					const pos = before.length + file.length + 2;
					ta.setSelectionRange(pos, pos);
				}
			}, 0);
		},
		[text, mentionStart, mentionFilter, closeMention],
	);

	const handleChange = (value: string) => {
		setText(value);
		const ta = textareaRef.current;
		if (!ta) return;
		const cursor = ta.selectionStart;
		const before = value.slice(0, cursor);

		// Check for slash command
		const slashMatch = before.match(/(?:^|\s)\/(\S*)$/);
		if (slashMatch && !mentionActive) {
			const filterText = slashMatch[1];
			setSlashActive(true);
			setSlashFilter(filterText);
			setSlashStart(cursor - filterText.length - 1);
			setSlashIdx(0);
			if (mentionActive) closeMention();
			return;
		}

		// Check for @mention
		const mentionMatch = before.match(/(?:^|\s)@(\S*)$/);
		if (mentionMatch) {
			const filterText = mentionMatch[1];
			setMentionActive(true);
			setMentionFilter(filterText);
			setMentionStart(cursor - filterText.length - 1);
			setMentionIdx(0);
			fetchMentions(filterText);
			if (slashActive) closeSlash();
			return;
		}

		if (slashActive) closeSlash();
		if (mentionActive) closeMention();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		// Slash popup key handling
		if (slashActive && filteredSlash.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSlashIdx((i) =>
					Math.min(i + 1, Math.max(0, filteredSlash.length - 1)),
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSlashIdx((i) => Math.max(i - 1, 0));
				return;
			}
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				applySlash(filteredSlash[slashIdx]);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				closeSlash();
				return;
			}
		}
		// Mention popup key handling
		if (mentionActive && mentionFiles.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setMentionIdx((i) =>
					Math.min(i + 1, Math.max(0, mentionFiles.length - 1)),
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setMentionIdx((i) => Math.max(i - 1, 0));
				return;
			}
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				applyMention(mentionFiles[mentionIdx]);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				closeMention();
				return;
			}
		}
		// Regular submit
		if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) {
			e.preventDefault();
			submit();
		}
	};

	const submit = () => {
		const value = text.trim();
		if (!value) return;
		// While the agent is busy, hold the message in a local queue so each can be
		// pushed or removed individually — the agent's own queue has no dequeue API.
		if (streaming) {
			onQueuePending?.(value);
		} else {
			onSend(value, "prompt");
		}
		setText("");
		requestAnimationFrame(adjustTextareaHeight);
		closeSlash();
		closeMention();
	};

	const agentQueued = [...queue.steering, ...queue.followUp];
	const canSubmit = !disabled && text.trim().length > 0;
	const showStop = streaming && !text.trim();

	return (
		<div
			className={`composer-wrap${centered ? " composer-wrap-centered" : ""}`}
		>
			{(workspaces.length > 0 || branches.length > 0) && (
				<div className="composer-context-row">
					{workspaces.length > 0 && (
						<select
							className="context-picker workspace-picker"
							value={selectedWorkspace}
							onChange={(event) => onWorkspace?.(event.target.value)}
						>
							{workspaces.map((workspace) => (
								<option key={workspace.path} value={workspace.path}>
									{workspace.name}
								</option>
							))}
						</select>
					)}
					{branches.length > 0 && (
						<select
							className="context-picker branch-picker"
							value={selectedBranch}
							onChange={(event) => onBranch?.(event.target.value)}
						>
							{branches.map((branch) => (
								<option key={branch} value={branch}>
									{branch}
								</option>
							))}
						</select>
					)}
				</div>
			)}
			{(agentQueued.length > 0 || pending.length > 0) && (
				<div className="queue-strip">
					{agentQueued.length > 0 && (
						<>
							<span className="queue-strip-label">awaiting agent</span>
							{agentQueued.map((message, index) => (
								<div
									key={`agent-${index}-${message}`}
									className="queue-item queue-item-readonly"
								>
									<span className="queue-item-text">{message}</span>
								</div>
							))}
						</>
					)}
					{pending.length > 0 && (
						<>
							<span className="queue-strip-label">
								{pending.length} queued · push to send
							</span>
							{pending.map((message, index) => (
								<div key={`${index}-${message}`} className="queue-item">
									<span className="queue-item-text">{message}</span>
									<button
										type="button"
										className="queue-item-btn"
										title={
											streaming ? "Steer the agent with this now" : "Send now"
										}
										aria-label="Send now"
										onClick={() => onPushPending?.(index)}
									>
										↑
									</button>
									<button
										type="button"
										className="queue-item-btn"
										title="Remove"
										aria-label="Remove"
										onClick={() => onRemovePending?.(index)}
									>
										×
									</button>
								</div>
							))}
						</>
					)}
				</div>
			)}
			<div
				className={`composer${dragOver ? " composer-dragover" : ""}`}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				<div className="composer-textarea-wrap">
					<textarea
						ref={textareaRef}
						value={text}
						rows={1}
						placeholder={
							disabled
								? "Open or create an agent…"
								: streaming
									? "Steer the agent…"
									: "Ask pi anything…"
						}
						disabled={disabled}
						onChange={(e) => handleChange(e.target.value)}
						onKeyDown={handleKeyDown}
						onPaste={handlePaste}
					/>
					{slashActive && (
						<div className="popup slash-popup">
							{slashLoading ? (
								<div className="popup-item">
									<span className="popup-desc">Loading slash commands…</span>
								</div>
							) : slashError ? (
								<div className="popup-item">
									<span className="popup-desc">Slash commands unavailable: {slashError}</span>
								</div>
							) : filteredSlash.length === 0 ? (
								<div className="popup-item">
									<span className="popup-desc">{slashEmptyText}</span>
								</div>
							) : (
								filteredSlash.map((cmd, i) => (
									<div
										key={cmd.id}
										className={`popup-item${i === slashIdx ? " popup-selected" : ""}`}
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => applySlash(cmd)}
									>
										<span className="popup-label">{cmd.label}</span>
										<span className="popup-desc">{cmd.description}</span>
									</div>
								))
							)}
						</div>
					)}
					{mentionActive && (
						<div className="popup mention-popup">
							{mentionLoading && mentionFiles.length === 0 ? (
								<div className="popup-item">
									<span className="popup-desc">Searching files…</span>
								</div>
							) : mentionFiles.length === 0 ? (
								<div className="popup-item">
									<span className="popup-desc">No matching files</span>
								</div>
							) : (
								mentionFiles.map((file, i) => (
									<div
										key={file}
										className={`popup-item${i === mentionIdx ? " popup-selected" : ""}`}
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => applyMention(file)}
									>
										<span className="popup-label">@{file}</span>
									</div>
								))
							)}
						</div>
					)}
				</div>
				<div className="composer-row">
					<div className="composer-controls">
						<select
							className="model-picker"
							disabled={disabled || models.length === 0}
							value={activeModel ? modelKey(activeModel) : ""}
							onChange={(event) => {
								const model = modelFromKey(event.target.value);
								if (model) onModel(model.provider, model.id);
							}}
						>
							{!activeModel && <option value="">Select model</option>}
							{activeModel &&
								!models.some(
									(model) => modelKey(model) === modelKey(activeModel),
								) && (
									<option value={modelKey(activeModel)}>
										{modelKey(activeModel)}
									</option>
								)}
							{models.map((model) => (
								<option key={modelKey(model)} value={modelKey(model)}>
									{modelKey(model)}
								</option>
							))}
						</select>
						<select
							className="thinking-picker"
							disabled={disabled}
							value={thinkingLevel}
							onChange={(e) => onThinking(e.target.value as ThinkingLevel)}
							onDoubleClick={onCycleThinking}
						>
							{thinkingLevels.map((level) => (
								<option key={level} value={level}>
									{level}
								</option>
							))}
						</select>
					</div>

					<button
						className={`send-btn${showStop ? " stop-btn" : ""}`}
						disabled={showStop ? disabled : !canSubmit}
						onClick={showStop ? onStop : submit}
						title={
							showStop ? "Abort" : streaming ? "Send to running agent" : "Send"
						}
						aria-label={
							showStop ? "Abort" : streaming ? "Send to running agent" : "Send"
						}
					>
						{showStop ? "■" : "↑"}
					</button>
				</div>
			</div>
		</div>
	);
}
