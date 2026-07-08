import { useEffect, useMemo, useState } from "react";
import {
	AlertTriangle,
	Check,
	Circle,
	HelpCircle,
	Send,
	X,
} from "lucide-react";
import type {
	SessionUiRequest,
	SessionUiResponse,
	TranscriptMessage,
	WorkActivityItem,
} from "../../shared/types.ts";

export const ACTIVITY_TOOL_NAMES = [
	"todo",
	"ask_user_question",
	"question",
	"questionnaire",
];

const BLOCKING_METHODS = new Set(["select", "confirm", "input", "editor"]);
const HIDDEN_ACTIVITY_LABELS = [/^pi-lens(?:\b|-)/i];

export function hiddenActivityToolCallIds(
	messages: TranscriptMessage[],
): Set<string> {
	const ids = new Set<string>();
	for (const message of currentTurnMessages(messages)) {
		for (const block of message.blocks) {
			if (
				block.kind === "toolCall" &&
				ACTIVITY_TOOL_NAMES.includes(block.name)
			) {
				ids.add(block.id);
			}
			if (
				block.kind === "toolResult" &&
				ACTIVITY_TOOL_NAMES.includes(block.toolName)
			) {
				ids.add(block.toolCallId);
			}
		}
	}
	return ids;
}

export function deriveWorkActivityItems(
	messages: TranscriptMessage[],
	active: boolean,
): WorkActivityItem[] {
	const calls = new Map<
		string,
		Extract<TranscriptMessage["blocks"][number], { kind: "toolCall" }>
	>();
	const results = new Map<
		string,
		Extract<TranscriptMessage["blocks"][number], { kind: "toolResult" }>
	>();

	for (const message of currentTurnMessages(messages)) {
		for (const block of message.blocks) {
			if (
				block.kind === "toolCall" &&
				ACTIVITY_TOOL_NAMES.includes(block.name)
			) {
				calls.set(block.id, block);
			} else if (
				block.kind === "toolResult" &&
				ACTIVITY_TOOL_NAMES.includes(block.toolName)
			) {
				results.set(block.toolCallId, block);
			}
		}
	}

	const items: WorkActivityItem[] = [];
	for (const [id, call] of calls) {
		const result = results.get(id);
		if (call.name === "todo") {
			const todos = extractTodoLabels(call.args, result?.text);
			if (todos.length > 0) {
				items.push(
					...todos.map((label, index) => ({
						id: `${id}:${index}`,
						label,
						status: result ? (result.isError ? "error" : "done") : "active",
					}) satisfies WorkActivityItem),
				);
				continue;
			}
		}

		const label = questionLabel(call.name, call.args);
		items.push({
			id,
			label,
			detail: result?.text ? firstLine(result.text) : undefined,
			status: result ? (result.isError ? "error" : "done") : active ? "waiting" : "active",
		});
	}

	for (const [id, result] of results) {
		if (calls.has(id)) continue;
		items.push({
			id,
			label: result.toolName,
			detail: firstLine(result.text),
			status: result.isError ? "error" : "done",
		});
	}

	return items.filter((item) => !isHiddenActivityItem(item));
}

function isHiddenActivityItem(item: WorkActivityItem): boolean {
	return HIDDEN_ACTIVITY_LABELS.some((pattern) => pattern.test(item.label.trim()));
}

export function WorkActivity({
	messages,
	active,
	uiRequests,
	onRespond,
}: {
	messages: TranscriptMessage[];
	active: boolean;
	uiRequests: SessionUiRequest[];
	onRespond: (response: SessionUiResponse) => Promise<void>;
}) {
	const activityItems = useMemo(
		() => deriveWorkActivityItems(messages, active),
		[messages, active],
	);
	const [answered, setAnswered] = useState<Record<string, string>>({});
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [phase, setPhase] = useState<"idle" | "active" | "done">(() =>
		active || uiRequests.length > 0 ? "active" : "idle",
	);

	const visibleRequests = uiRequests.filter(
		(request) => !answered[request.id] && renderableRequest(request),
	);
	const answeredItems: WorkActivityItem[] = Object.entries(answered).map(([id, label]) => ({
		id: `answered:${id}`,
		label: `Answered · ${label}`,
		status: "done" as const,
	}));
	const statusItems = uiRequests.flatMap(requestToActivityItem);
	const items = [...activityItems, ...statusItems, ...answeredItems];
	const live = active || visibleRequests.length > 0;

	useEffect(() => {
		if (live) {
			setPhase("active");
		} else if (phase === "active") {
			setPhase("done");
			const timer = setTimeout(() => setPhase("idle"), 1500);
			return () => clearTimeout(timer);
		}
	}, [live, phase]);

	if (phase === "idle" || (items.length === 0 && visibleRequests.length === 0))
		return null;

	if (phase === "done") {
		const count = items.length;
		return (
			<div className="work-activity">
				<div className="work-row work-row-done">
					<StatusIcon status="done" />
					<div className="work-row-text">
						<span>
							{count > 0
								? `Done · ${count} item${count === 1 ? "" : "s"}`
								: "Done"}
						</span>
					</div>
				</div>
			</div>
		);
	}

	async function submit(request: SessionUiRequest, response: SessionUiResponse, label: string) {
		setAnswered((prev) => ({ ...prev, [request.id]: label }));
		await onRespond(response);
	}

	return (
		<div className="work-activity">
			{items.map((item) => (
				<div key={item.id} className={`work-row work-row-${item.status}`}>
					<StatusIcon status={item.status} />
					<div className="work-row-text">
						<span>{item.label}</span>
						{item.detail ? <small>{item.detail}</small> : null}
					</div>
				</div>
			))}
			{visibleRequests.map((request) => (
				<div key={request.id} className="work-question">
					<div className="work-question-title">
						<HelpCircle size={14} />
						<span>{requestTitle(request)}</span>
					</div>
					{request.method === "select" && (
						<div className="work-question-options">
							{request.options.map((option) => (
								<button
									key={option}
									onClick={() =>
										void submit(request, { id: request.id, value: option }, option)
									}
								>
									{option}
								</button>
							))}
							<button
								className="work-question-cancel"
								title="Cancel"
								onClick={() =>
									void submit(
										request,
										{ id: request.id, cancelled: true },
										"Cancelled",
									)
								}
							>
								<X size={13} />
							</button>
						</div>
					)}
					{request.method === "confirm" && (
						<div className="work-question-options">
							<button
								onClick={() =>
									void submit(
										request,
										{ id: request.id, confirmed: true },
										"Yes",
									)
								}
							>
								Yes
							</button>
							<button
								onClick={() =>
									void submit(
										request,
										{ id: request.id, confirmed: false },
										"No",
									)
								}
							>
								No
							</button>
						</div>
					)}
					{(request.method === "input" || request.method === "editor") && (
						<form
							className="work-question-form"
							onSubmit={(event) => {
								event.preventDefault();
								const value = drafts[request.id]?.trim();
								if (!value) return;
								void submit(request, { id: request.id, value }, value);
							}}
						>
							{request.method === "editor" ? (
								<textarea
									value={drafts[request.id] ?? request.prefill ?? ""}
									onChange={(event) =>
										setDrafts((prev) => ({
											...prev,
											[request.id]: event.target.value,
										}))
									}
								/>
							) : (
								<input
									value={drafts[request.id] ?? ""}
									placeholder={request.placeholder}
									onChange={(event) =>
										setDrafts((prev) => ({
											...prev,
											[request.id]: event.target.value,
										}))
									}
								/>
							)}
							<button type="submit" title="Send answer">
								<Send size={13} />
							</button>
							<button
								type="button"
								title="Cancel"
								onClick={() =>
									void submit(
										request,
										{ id: request.id, cancelled: true },
										"Cancelled",
									)
								}
							>
								<X size={13} />
							</button>
						</form>
					)}
				</div>
			))}
		</div>
	);
}

function currentTurnMessages(messages: TranscriptMessage[]): TranscriptMessage[] {
	let start = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "user") {
			start = i + 1;
			break;
		}
	}
	return messages.slice(start);
}

function extractTodoLabels(args: unknown, resultText?: string): string[] {
	const fromArgs = labelsFromValue(args);
	if (fromArgs.length > 0) return fromArgs;
	if (!resultText) return [];
	return resultText
		.split("\n")
		.map((line) =>
			line
				.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "")
				.replace(/^\s*(?:\[.\]|[✓✔○●])\s*/, "")
				.trim(),
		)
		.filter(Boolean)
		.slice(0, 6);
}

function labelsFromValue(value: unknown): string[] {
	if (typeof value === "string") return [value].filter(Boolean);
	if (Array.isArray(value)) return value.flatMap(labelsFromValue).slice(0, 6);
	if (!value || typeof value !== "object") return [];
	const record = value as Record<string, unknown>;
	for (const key of ["todos", "todo", "items", "tasks", "steps", "questions"]) {
		const labels = labelsFromValue(record[key]);
		if (labels.length > 0) return labels;
	}
	for (const key of ["text", "title", "task", "content", "label", "question", "prompt"]) {
		if (typeof record[key] === "string" && record[key]) return [record[key]];
	}
	return [];
}

function questionLabel(toolName: string, args: unknown): string {
	const labels = labelsFromValue(args);
	return labels[0] ?? toolName;
}

function requestTitle(request: SessionUiRequest): string {
	if (request.method === "confirm")
		return request.message ? `${request.title}: ${request.message}` : request.title;
	if (request.method === "notify") return request.message;
	if (request.method === "setWidget") return request.widgetKey;
	if (request.method === "setStatus") return request.statusKey;
	if (request.method === "set_editor_text") return "Editor text";
	return request.title;
}

function requestToActivityItem(request: SessionUiRequest): WorkActivityItem[] {
	if (BLOCKING_METHODS.has(request.method)) return [];
	if (request.method === "setWidget") {
		return (request.widgetLines ?? []).map((line, index) => ({
			id: `${request.id}:${index}`,
			label: line,
			status: "done",
		}));
	}
	if (request.method === "setStatus" && !request.statusText) return [];
	return [
		{
			id: request.id,
			label: requestTitle(request),
			status: request.method === "notify" && request.notifyType === "error" ? "error" : "done",
			detail:
				request.method === "setStatus"
					? request.statusText
					: request.method === "set_editor_text"
						? firstLine(request.text)
						: undefined,
		},
	];
}

function renderableRequest(request: SessionUiRequest): boolean {
	return BLOCKING_METHODS.has(request.method);
}

function firstLine(text: string): string {
	return text.split("\n").find((line) => line.trim())?.trim() ?? "";
}

function StatusIcon({ status }: { status: WorkActivityItem["status"] }) {
	if (status === "done") return <Check size={13} />;
	if (status === "error") return <AlertTriangle size={13} />;
	return <Circle size={10} />;
}
