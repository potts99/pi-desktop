import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import type {
	AgentMode,
	MetricsAdvisorAction,
	MetricsAdvisorSeverity,
	MetricsDailyBucket,
	MetricsFilter,
	MetricsAdvisorRow,
	MetricsModelRow,
	MetricsProjectRow,
	MetricsRunRecord,
	MetricsSummary,
	MetricsTokenUsage,
	SessionStatsInfo,
	ThinkingLevel,
} from "../shared/types.ts";
import { getSettings } from "./settings-store.ts";

const metricsPath = join(homedir(), ".pi", "agent", "pi-desktop-metrics.jsonl");
const defaultSessionsDir = join(homedir(), ".pi", "agent", "sessions");

type PartialTokens = Partial<MetricsTokenUsage> & { totalTokens?: number };

interface RawSessionEntry {
	type?: string;
	id?: string;
	timestamp?: string;
	cwd?: string;
	provider?: string;
	modelId?: string;
	thinkingLevel?: ThinkingLevel;
	message?: {
		role?: string;
		model?: unknown;
		usage?: PartialTokens & {
			cost?: Partial<Record<"input" | "output" | "cacheRead" | "cacheWrite" | "total", number>>;
		};
		content?: unknown;
	};
}

export interface MetricStatsLike {
	sessionId?: string;
	tokens?: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		total?: number;
	};
	cost?: number;
	toolCalls?: number;
	toolResults?: number;
}

export interface WorkerMetricInput {
	id: string;
	projectPath: string;
	sessionPath?: string;
	sessionId?: string;
	startedAtMs: number;
	endedAtMs: number;
	model?: { provider: string; id: string } | null;
	modelKey?: string;
	thinkingLevel?: ThinkingLevel;
	mode?: AgentMode;
	requestMode?: "prompt" | "steer" | "followUp";
	status: MetricsRunRecord["status"];
	before: MetricStatsLike;
	after: MetricStatsLike;
}

export interface AdvisorMetricInput {
	id: string;
	projectPath: string;
	sessionPath?: string;
	sessionId?: string;
	startedAtMs: number;
	endedAtMs: number;
	model: { provider: string; id: string };
	thinkingLevel?: ThinkingLevel;
	severity: MetricsAdvisorSeverity;
	action: MetricsAdvisorAction;
	status: MetricsRunRecord["status"];
	before?: MetricStatsLike | null;
	after?: MetricStatsLike | null;
}

const zeroTokens = (): MetricsTokenUsage => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	reasoning: 0,
	total: 0,
});

function tokensFrom(value?: PartialTokens | null): MetricsTokenUsage {
	const input = finite(value?.input);
	const output = finite(value?.output);
	const cacheRead = finite(value?.cacheRead);
	const cacheWrite = finite(value?.cacheWrite);
	const reasoning = finite(value?.reasoning);
	const total =
		finite(value?.total) ||
		finite(value?.totalTokens) ||
		input + output + cacheRead + cacheWrite;
	return { input, output, cacheRead, cacheWrite, reasoning, total };
}

function finite(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addTokens(a: MetricsTokenUsage, b: MetricsTokenUsage): MetricsTokenUsage {
	return {
		input: a.input + b.input,
		output: a.output + b.output,
		cacheRead: a.cacheRead + b.cacheRead,
		cacheWrite: a.cacheWrite + b.cacheWrite,
		reasoning: a.reasoning + b.reasoning,
		total: a.total + b.total,
	};
}

function subtractStats(after: MetricStatsLike, before: MetricStatsLike): {
	tokens: MetricsTokenUsage;
	cost: number;
	toolCalls: number;
	toolResults: number;
} {
	const afterTokens = tokensFrom(after.tokens);
	const beforeTokens = tokensFrom(before.tokens);
	return {
		tokens: {
			input: Math.max(0, afterTokens.input - beforeTokens.input),
			output: Math.max(0, afterTokens.output - beforeTokens.output),
			cacheRead: Math.max(0, afterTokens.cacheRead - beforeTokens.cacheRead),
			cacheWrite: Math.max(0, afterTokens.cacheWrite - beforeTokens.cacheWrite),
			reasoning: Math.max(0, afterTokens.reasoning - beforeTokens.reasoning),
			total: Math.max(0, afterTokens.total - beforeTokens.total),
		},
		cost: Math.max(0, finite(after.cost) - finite(before.cost)),
		toolCalls: Math.max(0, finite(after.toolCalls) - finite(before.toolCalls)),
		toolResults: Math.max(0, finite(after.toolResults) - finite(before.toolResults)),
	};
}

function iso(ms: number): string {
	return new Date(ms).toISOString();
}

function dayOf(iso: string): string {
	const date = new Date(iso);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${date.getFullYear()}-${month}-${day}`;
}

function modelParts(modelKey: string): { provider?: string; modelId?: string } {
	const slash = modelKey.indexOf("/");
	if (slash <= 0) return { modelId: modelKey || undefined };
	return { provider: modelKey.slice(0, slash), modelId: modelKey.slice(slash + 1) };
}

function modelKeyOf(model?: { provider: string; id: string } | null, fallback = "unknown"): string {
	return model ? `${model.provider}/${model.id}` : fallback;
}

export function workerMetricRecord(input: WorkerMetricInput): MetricsRunRecord {
	const endedAt = iso(input.endedAtMs);
	const durationMs = Math.max(0, input.endedAtMs - input.startedAtMs);
	const delta = subtractStats(input.after, input.before);
	const modelKey = input.modelKey ?? modelKeyOf(input.model);
	const parts = input.model ? { provider: input.model.provider, modelId: input.model.id } : modelParts(modelKey);
	const tps =
		durationMs > 0 && delta.tokens.output > 0
			? delta.tokens.output / (durationMs / 1000)
			: null;
	return {
		id: input.id,
		source: "observed",
		actor: "worker",
		status: input.status,
		projectPath: input.projectPath,
		sessionPath: input.sessionPath,
		sessionId: input.sessionId ?? input.after.sessionId,
		startedAt: iso(input.startedAtMs),
		endedAt,
		day: dayOf(endedAt),
		modelKey,
		provider: parts.provider,
		modelId: parts.modelId,
		thinkingLevel: input.thinkingLevel,
		mode: input.mode,
		requestMode: input.requestMode,
		durationMs,
		tps,
		tokens: delta.tokens,
		cost: delta.cost,
		toolCalls: delta.toolCalls,
		toolResults: delta.toolResults,
	};
}

export function advisorMetricRecord(input: AdvisorMetricInput): MetricsRunRecord {
	const before = input.before ?? {};
	const after = input.after ?? {};
	const delta = input.after && input.before ? subtractStats(after, before) : {
		tokens: zeroTokens(),
		cost: 0,
		toolCalls: 0,
		toolResults: 0,
	};
	const endedAt = iso(input.endedAtMs);
	const durationMs = Math.max(0, input.endedAtMs - input.startedAtMs);
	return {
		id: input.id,
		source: "observed",
		actor: "advisor",
		status: input.status,
		projectPath: input.projectPath,
		sessionPath: input.sessionPath,
		sessionId: input.sessionId ?? after.sessionId,
		startedAt: iso(input.startedAtMs),
		endedAt,
		day: dayOf(endedAt),
		modelKey: modelKeyOf(input.model),
		provider: input.model.provider,
		modelId: input.model.id,
		thinkingLevel: input.thinkingLevel,
		durationMs,
		tps: null,
		tokens: delta.tokens,
		cost: delta.cost,
		toolCalls: delta.toolCalls,
		toolResults: delta.toolResults,
		advisorSeverity: input.severity,
		advisorAction: input.action,
	};
}

export async function appendMetricRecord(record: MetricsRunRecord): Promise<void> {
	// ponytail: bare appendFile; concurrent session finishes could interleave lines.
	// Add a single-writer queue if the log ever shows torn entries.
	await mkdir(dirname(metricsPath), { recursive: true });
	await appendFile(metricsPath, `${JSON.stringify(record)}\n`, "utf-8");
}

async function readRawRecords(): Promise<MetricsRunRecord[]> {
	try {
		const lines = (await readFile(metricsPath, "utf-8")).split("\n");
		const records: MetricsRunRecord[] = [];
		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line) as MetricsRunRecord;
				if (typeof parsed.id === "string" && parsed.id) records.push(normalizeRecord(parsed));
			} catch {
				/* skip malformed metric lines */
			}
		}
		return records;
	} catch {
		return [];
	}
}

export async function readMetricRecords(): Promise<MetricsRunRecord[]> {
	const byId = new Map<string, MetricsRunRecord>();
	for (const record of await readRawRecords()) byId.set(record.id, record);
	return [...byId.values()];
}

function normalizeRecord(record: MetricsRunRecord): MetricsRunRecord {
	const endedAt = record.endedAt || record.startedAt || new Date().toISOString();
	return {
		...record,
		source: record.source === "backfill" ? "backfill" : "observed",
		actor: record.actor === "advisor" ? "advisor" : "worker",
		status: record.status ?? "completed",
		projectPath: record.projectPath || "unknown",
		startedAt: record.startedAt || endedAt,
		endedAt,
		day: record.day || dayOf(endedAt),
		modelKey: record.modelKey || "unknown",
		durationMs: record.durationMs ?? null,
		tps: record.tps ?? null,
		tokens: tokensFrom(record.tokens),
		cost: finite(record.cost),
		toolCalls: finite(record.toolCalls),
		toolResults: finite(record.toolResults),
	};
}

export async function getMetricsSummary(filter: MetricsFilter = {}): Promise<MetricsSummary> {
	return summarizeMetrics(await readMetricRecords(), filter);
}

export async function refreshMetricsBackfill(filter: MetricsFilter = {}): Promise<MetricsSummary> {
	const stored = await readMetricRecords();
	const existing = new Set(stored.map((record) => record.id));
	// Sessions already covered by observed records are skipped so live + backfill
	// don't double-count the same turns.
	const observedSessionIds = new Set(
		stored
			.filter((record) => record.source === "observed" && record.sessionId)
			.map((record) => record.sessionId as string),
	);
	const sessionFiles = await findSessionFiles(await sessionRoot());
	const additions: MetricsRunRecord[] = [];
	for (const file of sessionFiles) {
		const records = await parseSessionFile(file);
		for (const record of records) {
			if (record.sessionId && observedSessionIds.has(record.sessionId)) continue;
			if (existing.has(record.id)) continue;
			existing.add(record.id);
			additions.push(record);
		}
	}
	if (additions.length > 0) {
		await mkdir(dirname(metricsPath), { recursive: true });
		await appendFile(
			metricsPath,
			additions.map((record) => JSON.stringify(record)).join("\n") + "\n",
			"utf-8",
		);
	}
	return getMetricsSummary(filter);
}

async function sessionRoot(): Promise<string> {
	const settings = await getSettings();
	return typeof settings.sessionDir === "string" && settings.sessionDir
		? settings.sessionDir.replace(/^~(?=\/|$)/, homedir())
		: defaultSessionsDir;
}

async function findSessionFiles(root: string): Promise<string[]> {
	const found: string[] = [];
	async function visit(dir: string): Promise<void> {
		let entries: Array<{
			name: string;
			isDirectory(): boolean;
			isFile(): boolean;
		}>;
		try {
			entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
		} catch {
			return;
		}
		await Promise.all(
			entries.map(async (entry) => {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) await visit(path);
				else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(path);
			}),
		);
	}
	await visit(root);
	return found.sort();
}

export async function parseSessionFile(sessionPath: string): Promise<MetricsRunRecord[]> {
	let text: string;
	try {
		text = await readFile(sessionPath, "utf-8");
	} catch {
		return [];
	}
	const records: MetricsRunRecord[] = [];
	let projectPath = "unknown";
	let sessionId = basename(sessionPath, ".jsonl");
	let modelKey = "unknown";
	let thinkingLevel: ThinkingLevel | undefined;

	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		let entry: RawSessionEntry;
		try {
			entry = JSON.parse(line) as RawSessionEntry;
		} catch {
			continue;
		}
		if (entry.type === "session") {
			projectPath = typeof entry.cwd === "string" && entry.cwd ? entry.cwd : projectPath;
			sessionId = typeof entry.id === "string" && entry.id ? entry.id : sessionId;
			continue;
		}
		if (entry.type === "model_change") {
			if (entry.provider && entry.modelId) modelKey = `${entry.provider}/${entry.modelId}`;
			continue;
		}
		if (entry.type === "thinking_level_change") {
			thinkingLevel = entry.thinkingLevel;
			continue;
		}
		if (
			entry.type !== "message" ||
			entry.message?.role !== "assistant" ||
			!entry.message.usage ||
			!entry.id ||
			!entry.timestamp
		) {
			continue;
		}

		const messageModel = modelKeyFromUnknown(entry.message.model);
		const actualModelKey = messageModel || modelKey;
		const endedAt = new Date(entry.timestamp).toISOString();
		const parts = modelParts(actualModelKey);
		records.push({
			id: `backfill:${sessionPath}:${entry.id}`,
			source: "backfill",
			actor: "worker",
			status: "completed",
			projectPath,
			sessionPath,
			sessionId,
			startedAt: endedAt,
			endedAt,
			day: dayOf(endedAt),
			modelKey: actualModelKey,
			provider: parts.provider,
			modelId: parts.modelId,
			thinkingLevel,
			durationMs: null,
			tps: null,
			tokens: tokensFrom(entry.message.usage),
			cost: finite(entry.message.usage.cost?.total),
			toolCalls: Array.isArray(entry.message.content)
				? entry.message.content.filter((item) => {
						return !!item && typeof item === "object" && (item as { type?: string }).type === "toolCall";
					}).length
				: 0,
			toolResults: 0,
		});
	}
	return records;
}

function modelKeyFromUnknown(value: unknown): string | null {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value !== "object") return null;
	const record = value as Record<string, unknown>;
	if (typeof record.provider === "string" && typeof record.id === "string") {
		return `${record.provider}/${record.id}`;
	}
	if (typeof record.id === "string") return record.id;
	return null;
}

export function summarizeMetrics(
	allRecords: MetricsRunRecord[],
	filter: MetricsFilter = {},
): MetricsSummary {
	const availableProjects = [...new Set(allRecords.map((record) => record.projectPath))].sort();
	const availableModels = [...new Set(allRecords.map((record) => record.modelKey))].sort();
	const from = filter.from ? filter.from.slice(0, 10) : null;
	const to = filter.to ? filter.to.slice(0, 10) : null;
	const records = allRecords
		.filter((record) => {
			const day = record.day || dayOf(record.endedAt);
			if (from && day < from) return false;
			if (to && day > to) return false;
			if (filter.projectPath && record.projectPath !== filter.projectPath) return false;
			if (filter.modelKey && record.modelKey !== filter.modelKey) return false;
			if (filter.actor && record.actor !== filter.actor) return false;
			return true;
		})
		.sort((a, b) => a.endedAt.localeCompare(b.endedAt));

	const totals = {
		runs: records.length,
		cost: 0,
		tokens: zeroTokens(),
		averageTps: null as number | null,
		tpsSamples: 0,
		activeProjects: new Set<string>(),
		advisorReviews: 0,
		advisorInterventions: 0,
	};
	let tpsOutput = 0;
	let tpsSeconds = 0;

	const daily = new Map<string, MetricsDailyBucket>();
	const projects = new Map<string, MetricsProjectRow & { modelTokens: Map<string, number>; tpsOutput: number; tpsSeconds: number }>();
	const models = new Map<string, MetricsModelRow & { tpsOutput: number; tpsSeconds: number }>();
	const advisors = new Map<string, MetricsAdvisorRow & { durationTotal: number; durationSamples: number }>();

	for (const record of records) {
		totals.cost += record.cost;
		totals.tokens = addTokens(totals.tokens, record.tokens);
		totals.activeProjects.add(record.projectPath);
		if (record.tps !== null && record.durationMs && record.durationMs > 0) {
			totals.tpsSamples += 1;
			tpsOutput += record.tokens.output;
			tpsSeconds += record.durationMs / 1000;
		}
		if (record.actor === "advisor") {
			totals.advisorReviews += 1;
			if (record.advisorAction && record.advisorAction !== "none")
				totals.advisorInterventions += 1;
		}

		const day = getDaily(daily, record.day);
		day.runs += 1;
		day.cost += record.cost;
		day.tokens = addTokens(day.tokens, record.tokens);

		const project = getProject(projects, record.projectPath);
		project.runs += 1;
		project.cost += record.cost;
		project.tokens = addTokens(project.tokens, record.tokens);
		project.lastUsedAt = record.endedAt;
		project.modelTokens.set(
			record.modelKey,
			(project.modelTokens.get(record.modelKey) ?? 0) + record.tokens.total,
		);
		if (record.durationMs && record.durationMs > 0 && record.tokens.output > 0) {
			project.tpsOutput += record.tokens.output;
			project.tpsSeconds += record.durationMs / 1000;
		}

		const model = getModel(models, record.modelKey);
		model.runs += 1;
		model.cost += record.cost;
		model.tokens = addTokens(model.tokens, record.tokens);
		model.lastUsedAt = record.endedAt;
		if (record.durationMs && record.durationMs > 0 && record.tokens.output > 0) {
			model.tpsOutput += record.tokens.output;
			model.tpsSeconds += record.durationMs / 1000;
		}

		if (record.actor === "advisor") {
			const advisor = getAdvisor(advisors, record.modelKey);
			advisor.reviews += 1;
			advisor.cost += record.cost;
			advisor.tokens = addTokens(advisor.tokens, record.tokens);
			advisor.lastUsedAt = record.endedAt;
			if (record.advisorAction && record.advisorAction !== "none")
				advisor.interventions += 1;
			const severity = record.advisorSeverity ?? "none";
			advisor.severityCounts[severity] += 1;
			if (record.durationMs !== null) {
				advisor.durationSamples += 1;
				advisor.durationTotal += record.durationMs;
			}
		}
	}

	const maxDayTokens = Math.max(0, ...[...daily.values()].map((bucket) => bucket.tokens.total));
	const heatmapCells = heatmapRange(records, daily).map((day) => {
		const bucket = daily.get(day);
		return {
			day,
			level: heatmapLevel(bucket?.tokens.total ?? 0, maxDayTokens),
			runs: bucket?.runs ?? 0,
			cost: bucket?.cost ?? 0,
			tokens: bucket?.tokens ?? zeroTokens(),
		};
	});

	return {
		filter,
		availableProjects,
		availableModels,
		generatedAt: new Date().toISOString(),
		totals: {
			runs: totals.runs,
			cost: totals.cost,
			tokens: totals.tokens,
			averageTps: tpsSeconds > 0 ? tpsOutput / tpsSeconds : null,
			tpsSamples: totals.tpsSamples,
			activeProjects: totals.activeProjects.size,
			advisorReviews: totals.advisorReviews,
			advisorInterventions: totals.advisorInterventions,
		},
		dailyBuckets: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
		heatmapCells,
		projectRows: [...projects.values()]
			.map(({ modelTokens, tpsOutput: output, tpsSeconds: seconds, ...row }) => ({
				...row,
				topModelKey:
					[...modelTokens.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown",
				averageTps: seconds > 0 ? output / seconds : null,
			}))
			.sort((a, b) => b.tokens.total - a.tokens.total),
		modelRows: [...models.values()]
			.map(({ tpsOutput: output, tpsSeconds: seconds, ...row }) => ({
				...row,
				averageTps: seconds > 0 ? output / seconds : null,
			}))
			.sort((a, b) => b.tokens.total - a.tokens.total),
		advisorRows: [...advisors.values()]
			.map(({ durationTotal, durationSamples, ...row }) => ({
				...row,
				averageDurationMs: durationSamples > 0 ? durationTotal / durationSamples : null,
			}))
			.sort((a, b) => b.reviews - a.reviews),
		records,
	};
}

function getDaily(map: Map<string, MetricsDailyBucket>, day: string): MetricsDailyBucket {
	let bucket = map.get(day);
	if (!bucket) {
		bucket = { day, runs: 0, cost: 0, tokens: zeroTokens(), averageTps: null };
		map.set(day, bucket);
	}
	return bucket;
}

function getProject(
	map: Map<string, MetricsProjectRow & { modelTokens: Map<string, number>; tpsOutput: number; tpsSeconds: number }>,
	projectPath: string,
) {
	let row = map.get(projectPath);
	if (!row) {
		row = {
			projectPath,
			projectName: projectPath === "unknown" ? "unknown" : basename(projectPath),
			runs: 0,
			cost: 0,
			tokens: zeroTokens(),
			averageTps: null,
			topModelKey: "unknown",
			lastUsedAt: "",
			modelTokens: new Map(),
			tpsOutput: 0,
			tpsSeconds: 0,
		};
		map.set(projectPath, row);
	}
	return row;
}

function getModel(map: Map<string, MetricsModelRow & { tpsOutput: number; tpsSeconds: number }>, modelKey: string) {
	let row = map.get(modelKey);
	if (!row) {
		row = {
			modelKey,
			runs: 0,
			cost: 0,
			tokens: zeroTokens(),
			averageTps: null,
			lastUsedAt: "",
			tpsOutput: 0,
			tpsSeconds: 0,
		};
		map.set(modelKey, row);
	}
	return row;
}

function getAdvisor(
	map: Map<string, MetricsAdvisorRow & { durationTotal: number; durationSamples: number }>,
	modelKey: string,
) {
	let row = map.get(modelKey);
	if (!row) {
		row = {
			modelKey,
			reviews: 0,
			interventions: 0,
			cost: 0,
			tokens: zeroTokens(),
			averageDurationMs: null,
			severityCounts: { none: 0, nit: 0, concern: 0, blocker: 0 },
			lastUsedAt: "",
			durationTotal: 0,
			durationSamples: 0,
		};
		map.set(modelKey, row);
	}
	return row;
}

function heatmapRange(records: MetricsRunRecord[], daily: Map<string, MetricsDailyBucket>): string[] {
	const existing = [...daily.keys()].sort();
	const end = existing.at(-1) ?? dayOf(new Date().toISOString());
	const start = existing[0] ?? dayOffset(end, -89);
	const days: string[] = [];
	let cursor = start;
	while (cursor <= end && days.length < 370) {
		days.push(cursor);
		cursor = dayOffset(cursor, 1);
	}
	if (records.length === 0 && days.length === 0) return [];
	return days;
}

function dayOffset(day: string, amount: number): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + amount);
	return date.toISOString().slice(0, 10);
}

function heatmapLevel(value: number, max: number): number {
	if (value <= 0 || max <= 0) return 0;
	if (value >= max) return 4;
	const ratio = value / max;
	if (ratio >= 0.7) return 3;
	if (ratio >= 0.35) return 2;
	return 1;
}

export function statsLike(stats: SessionStatsInfo | null | undefined): MetricStatsLike {
	return {
		sessionId: stats?.sessionId,
		tokens: stats?.tokens,
		cost: stats?.cost,
		toolCalls: stats?.toolCalls,
		toolResults: stats?.toolResults,
	};
}
