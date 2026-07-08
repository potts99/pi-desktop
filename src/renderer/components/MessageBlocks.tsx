import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TranscriptMessage } from "../../shared/types.ts";
import { parseAdvisory } from "../../shared/view-model.ts";
import { DiffViewer } from "./DiffViewer.tsx";

export function MessageBlocks({
	msg,
	isStreaming,
	onFork,
	hiddenToolCallIds,
}: {
	msg: TranscriptMessage;
	isStreaming?: boolean;
	onFork?: (entryId: string) => void;
	hiddenToolCallIds?: Set<string>;
}) {
	const advisory =
		msg.blocks.length === 1 && msg.blocks[0].kind === "text"
			? parseAdvisory(msg.blocks[0].text)
			: null;

	if (advisory) {
		return (
			<div className="msg-wrap">
				<div className={`msg msg-advisor msg-advisor-${advisory.severity}`}>
					<div className="advisor-label">
						Advisor · {advisory.severity}
						{advisory.model ? ` · ${advisory.model}` : ""}
					</div>
					<div className="advisor-body">
						<Markdown remarkPlugins={[remarkGfm]}>{advisory.body}</Markdown>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="msg-wrap">
			<div className={`msg msg-${msg.role}`}>
				{msg.blocks.map((b, i) => {
					if (b.kind === "error")
						return (
							<div key={i} className="msg-error-block">
								<span className="msg-error-glyph">⚠</span>
								<Markdown remarkPlugins={[remarkGfm]}>{b.text}</Markdown>
							</div>
						);
					if (b.kind === "text")
						return (
							<span key={i}>
								<Markdown remarkPlugins={[remarkGfm]}>{b.text}</Markdown>
								{isStreaming && <span className="streaming-cursor">▊</span>}
							</span>
						);
					if (b.kind === "thinking")
						return (
							<Collapsible key={i} summary="Thinking…">
								<pre className="thinking">{b.text}</pre>
							</Collapsible>
						);
					if (b.kind === "toolCall") {
						if (hiddenToolCallIds?.has(b.id)) return null;
						const args = b.args as {
							path?: string;
							edits?: { oldText: string; newText: string }[];
						};
						return (
							<Collapsible key={i} summary={toolCallSummary(b)}>
								{b.name === "edit" && Array.isArray(args.edits) ? (
									<DiffViewer path={args.path} edits={args.edits} />
								) : (
									<pre className="tool-raw">
										{JSON.stringify(b.args, null, 2)}
									</pre>
								)}
							</Collapsible>
						);
					}
					if (b.kind === "toolResult") {
						if (hiddenToolCallIds?.has(b.toolCallId)) return null;
						return (
							<Collapsible key={i} summary={resultSummary(b)} error={b.isError}>
								{renderToolResult(b)}
							</Collapsible>
						);
					}
					return null;
				})}
			</div>
			{msg.role === "user" && msg.id && (
				<div className="msg-actions">
					<button title="Fork from here" onClick={() => onFork?.(msg.id!)}>
						Branch
					</button>
				</div>
			)}
		</div>
	);
}

/* ── Tool call one-liner ── */

function Collapsible({
	summary,
	error,
	children,
}: {
	summary: string;
	error?: boolean;
	children?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className={`tool-block${error ? " tool-error" : ""}`}>
			<button
				className="tool-head"
				onClick={() => setOpen((o) => !o)}
				title={open ? "Collapse" : "Expand"}
			>
				<span className="tool-chev">{open ? "▾" : "▸"}</span>
				<span className="tool-summary">{summary}</span>
			</button>
			{open && children ? <div className="tool-detail">{children}</div> : null}
		</div>
	);
}

function resultSummary(
	b: Extract<TranscriptMessage["blocks"][number], { kind: "toolResult" }>,
): string {
	const text = typeof b.text === "string" ? b.text : "";
	const lines = text ? text.split("\n").length : 0;
	const status = b.isError ? "✗" : "✓";
	return `${status} ${b.toolName}${lines ? ` · ${lines} line${lines !== 1 ? "s" : ""}` : ""}`;
}

function toolCallSummary(b: { name: string; args: unknown }): string {
	if (typeof b.args !== "object" || b.args === null) return `${b.name}(…)`;
	const a = b.args as Record<string, unknown>;
	if (b.name === "edit") {
		const path = a.path ?? "";
		const count = Array.isArray(a.edits) ? a.edits.length : 0;
		return `edit "${path}" — ${count} edit${count !== 1 ? "s" : ""}`;
	}
	if (b.name === "bash")
		return `bash "${truncate(String(a.command ?? ""), 60)}"`;
	if (b.name === "read") return `read "${truncate(String(a.path ?? ""), 80)}"`;
	if (b.name === "grep")
		return `grep "${truncate(String(a.pattern ?? ""), 40)}"`;
	const first = Object.values(a)[0];
	return `${b.name}(${first !== undefined ? truncate(JSON.stringify(first), 50) : "…"})`;
}

/* ── Tool result renderer ── */

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function renderToolResult(
	b: Extract<TranscriptMessage["blocks"][number], { kind: "toolResult" }>,
) {
	const raw = typeof b.text === "string" ? b.text : "";
	const diff = b.diff ?? extractDiff(raw.replace(ANSI_RE, ""));
	if (diff) return <DiffBody text={diff} />;
	return <pre className="tool-raw">{raw}</pre>;
}

/** Pull a pre-formatted diff block out of raw tool text, if present. */
function extractDiff(clean: string): string | null {
	return /^[-+ ]\d+ /.test(clean) ? clean : null;
}

function DiffBody({ text }: { text: string }) {
	return (
		<pre className="diff-body">
			{text.split("\n").map((line, i) => {
				const p = line[0];
				if (p === "-")
					return (
						<div key={i} className="diff-del">
							{line}
						</div>
					);
				if (p === "+")
					return (
						<div key={i} className="diff-add">
							{line}
						</div>
					);
				if (p === " ")
					return (
						<div key={i} className="diff-ctx">
							{line}
						</div>
					);
				return (
					<div key={i} className="diff-ctx">
						{line || " "}
					</div>
				);
			})}
		</pre>
	);
}

/* ── Helpers ── */

function truncate(s: string, n: number) {
	return s.length > n ? s.slice(0, n) + "…" : s;
}
