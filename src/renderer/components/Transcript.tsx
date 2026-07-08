import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type {
	ModelChoice,
	RetryState,
	SessionUiRequest,
	SessionUiResponse,
	TranscriptMessage,
} from "../../shared/types.ts";
import { MessageBlocks } from "./MessageBlocks.tsx";
import { hiddenActivityToolCallIds, WorkActivity } from "./WorkActivity.tsx";

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function modelLabel(model: ModelChoice | null | undefined): string {
	return model ? `${model.provider}/${model.id}` : "";
}

function formatElapsed(milliseconds: number): string {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Transcript({
	messages = [],
	streamingText,
	streaming = false,
	workingStartedAt = null,
	activeModel = null,
	advisorReviewing = false,
	advisorModel = null,
	error = null,
	retry = { active: false },
	uiRequests = [],
	onRetry,
	onDismissError,
	onRespondToUiRequest,
	onFork,
}: {
	messages?: TranscriptMessage[];
	streamingText: string;
	streaming?: boolean;
	workingStartedAt?: number | null;
	activeModel?: ModelChoice | null;
	advisorReviewing?: boolean;
	advisorModel?: ModelChoice | null;
	error?: string | null;
	retry?: RetryState;
	uiRequests?: SessionUiRequest[];
	onRetry?: () => void;
	onDismissError?: () => void;
	onRespondToUiRequest?: (response: SessionUiResponse) => Promise<void>;
	onFork: (entryId: string) => void;
}) {
	const end = useRef<HTMLDivElement>(null);
	const container = useRef<HTMLDivElement>(null);
	const [userScrolledUp, setUserScrolledUp] = useState(false);

	const onScroll = useCallback(() => {
		const el = container.current;
		if (!el) return;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
		setUserScrolledUp(!atBottom);
	}, []);

	useEffect(() => {
		if (!userScrolledUp) end.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, streamingText, error, retry.active, uiRequests, userScrolledUp]);

	const hiddenToolCallIds = useMemo(
		() => hiddenActivityToolCallIds(messages),
		[messages],
	);

	return (
		<div className="transcript" ref={container} onScroll={onScroll}>
			{messages.map((m, i) => (
				<MessageBlocks
					key={m.id ?? i}
					msg={m}
					onFork={onFork}
					hiddenToolCallIds={hiddenToolCallIds}
				/>
			))}
			{streamingText && (
				<MessageBlocks
					isStreaming
					msg={{
						role: "assistant",
						blocks: [{ kind: "text", text: streamingText }],
					}}
				/>
			)}
			{error && (
				<SessionStatusMessage
					error={error}
					onRetry={onRetry}
					onDismiss={onDismissError}
				/>
			)}
			{!error && retry.active && <RetryStatus retry={retry} />}
			<WorkIndicator
				active={streaming || uiRequests.length > 0}
				model={activeModel}
				workingStartedAt={workingStartedAt}
			/>
			<div className="msg-wrap">
				<WorkActivity
					messages={messages}
					active={streaming}
					uiRequests={uiRequests}
					onRespond={onRespondToUiRequest ?? (async () => {})}
				/>
			</div>
			{advisorReviewing && (
				<div className="msg-wrap">
					<div className="msg advisor-reviewing">
						<span className="advisor-label">Advisor</span> reviewing…
						{modelLabel(advisorModel) && (
							<span className="advisor-model">{modelLabel(advisorModel)}</span>
						)}
					</div>
				</div>
			)}
			<div ref={end} />
		</div>
	);
}

function SessionStatusMessage({
	error,
	onRetry,
	onDismiss,
}: {
	error: string;
	onRetry?: () => void;
	onDismiss?: () => void;
}) {
	return (
		<div className="msg-wrap">
			<div className="msg msg-run-status msg-run-status-error">
				<div className="msg-error-block">
					<span className="msg-error-glyph">⚠</span>
					<div className="msg-run-status-body">
						<div className="msg-run-status-label">Run stopped</div>
						<p>{readableError(error)}</p>
					</div>
				</div>
				<div className="msg-run-status-actions">
					{onRetry && <button onClick={onRetry}>Retry</button>}
					{onDismiss && <button onClick={onDismiss}>Dismiss</button>}
				</div>
			</div>
		</div>
	);
}

function RetryStatus({ retry }: { retry: RetryState }) {
	const [frame, setFrame] = useState(0);

	useEffect(() => {
		const id = setInterval(
			() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length),
			80,
		);
		return () => clearInterval(id);
	}, []);

	const attempts =
		retry.attempt && retry.maxAttempts
			? ` ${retry.attempt}/${retry.maxAttempts}`
			: "";
	return (
		<div className="msg-wrap">
			<div className="msg msg-run-status">
				<span className="pi-spinner" style={{ display: "inline" }}>
					{BRAILLE_FRAMES[frame]}
				</span>{" "}
				Retrying{attempts}
				{retry.message ? ` · ${retry.message}` : ""}
			</div>
		</div>
	);
}

function readableError(raw: string): string {
	const parsed = parseJson(raw);
	if (parsed) {
		const message = findErrorMessage(parsed);
		if (message) return message;
	}
	return raw;
}

function parseJson(raw: string): unknown | null {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function findErrorMessage(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (!value || typeof value !== "object") return null;

	const record = value as Record<string, unknown>;
	for (const key of ["message", "errorMessage", "finalError"]) {
		const nested = findErrorMessage(record[key]);
		if (nested) return nested;
	}
	return findErrorMessage(record.error);
}

function WorkIndicator({
	active,
	model,
	workingStartedAt,
}: {
	active: boolean;
	model: ModelChoice | null;
	workingStartedAt: number | null;
}) {
	const [phase, setPhase] = useState<"idle" | "active" | "done">("idle");
	const [frame, setFrame] = useState(0);
	const [, setTick] = useState(0);

	useEffect(() => {
		if (active) {
			setPhase("active");
		} else if (phase === "active") {
			setPhase("done");
			const timer = setTimeout(() => setPhase("idle"), 1500);
			return () => clearTimeout(timer);
		}
	}, [active]);

	useEffect(() => {
		if (phase !== "active") return;
		const id = setInterval(
			() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length),
			80,
		);
		return () => clearInterval(id);
	}, [phase]);

	// One-second tick so elapsed time updates while active.
	useEffect(() => {
		if (phase !== "active" || workingStartedAt === null) return;
		const id = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(id);
	}, [phase, workingStartedAt]);

	if (phase === "idle") return null;

	const char = phase === "done" ? "✓" : BRAILLE_FRAMES[frame];
	const label = modelLabel(model);
	const elapsed =
		phase === "active" && workingStartedAt !== null
			? formatElapsed(Date.now() - workingStartedAt)
			: "";

	let text: string;
	if (phase === "done") {
		text = "Done";
	} else if (elapsed && label) {
		text = `Working · ${elapsed} · ${label}`;
	} else if (elapsed) {
		text = `Working · ${elapsed}`;
	} else {
		text = label ? `Working · ${label}` : "Working";
	}

	return (
		<div className="msg-wrap">
			<div className="msg">
				<span className="pi-spinner" style={{ display: "inline" }}>
					{char}
				</span>{" "}
				{text}
			</div>
		</div>
	);
}
