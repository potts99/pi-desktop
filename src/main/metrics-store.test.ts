import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	advisorMetricRecord,
	parseSessionFile,
	summarizeMetrics,
	workerMetricRecord,
} from "./metrics-store.ts";
import type { MetricsRunRecord } from "../shared/types.ts";

function record(over: Partial<MetricsRunRecord>): MetricsRunRecord {
	const has = (key: keyof MetricsRunRecord) =>
		Object.prototype.hasOwnProperty.call(over, key);
	return {
		id: over.id ?? Math.random().toString(36),
		source: over.source ?? "observed",
		actor: over.actor ?? "worker",
		status: over.status ?? "completed",
		projectPath: over.projectPath ?? "/repo/a",
		startedAt: over.startedAt ?? "2026-07-01T10:00:00.000Z",
		endedAt: over.endedAt ?? "2026-07-01T10:00:10.000Z",
		day: over.day ?? "2026-07-01",
		modelKey: over.modelKey ?? "openai/gpt-5",
		durationMs: has("durationMs") ? (over.durationMs ?? null) : 10_000,
		tps: has("tps") ? (over.tps ?? null) : 20,
		tokens: over.tokens ?? {
			input: 100,
			output: 200,
			cacheRead: 10,
			cacheWrite: 5,
			reasoning: 0,
			total: 315,
		},
		cost: over.cost ?? 0.1,
		toolCalls: over.toolCalls ?? 2,
		toolResults: over.toolResults ?? 1,
		...over,
	};
}

describe("metrics aggregation", () => {
	it("summarizes totals, projects, models, advisor rows, and TPS samples", () => {
		const summary = summarizeMetrics([
			record({ id: "r1", projectPath: "/repo/a", modelKey: "openai/gpt-5" }),
			record({
				id: "r2",
				source: "backfill",
				projectPath: "/repo/b",
				modelKey: "anthropic/claude",
				durationMs: null,
				tps: null,
				tokens: {
					input: 50,
					output: 75,
					cacheRead: 0,
					cacheWrite: 0,
					reasoning: 0,
					total: 125,
				},
			}),
			record({
				id: "a1",
				actor: "advisor",
				modelKey: "openai/gpt-5",
				advisorSeverity: "concern",
				advisorAction: "steer",
				durationMs: 2500,
				tps: null,
			}),
		]);

		expect(summary.totals.runs).toBe(3);
		expect(summary.totals.tokens.total).toBe(755);
		expect(summary.totals.tpsSamples).toBe(1);
		expect(summary.totals.averageTps).toBeCloseTo(20);
		expect(summary.totals.activeProjects).toBe(2);
		expect(summary.totals.advisorReviews).toBe(1);
		expect(summary.totals.advisorInterventions).toBe(1);
		expect(summary.projectRows[0].topModelKey).toBe("openai/gpt-5");
		expect(summary.modelRows[0].modelKey).toBe("openai/gpt-5");
		expect(summary.advisorRows[0].severityCounts.concern).toBe(1);
		expect(summary.heatmapCells.some((cell) => cell.day === "2026-07-01")).toBe(true);
	});

	it("filters by date, project, model, and actor", () => {
		const summary = summarizeMetrics(
			[
				record({ id: "r1", projectPath: "/repo/a", modelKey: "m/a" }),
				record({
					id: "r2",
					projectPath: "/repo/b",
					modelKey: "m/b",
					actor: "advisor",
					endedAt: "2026-07-02T10:00:00.000Z",
					day: "2026-07-02",
				}),
			],
			{ from: "2026-07-02", projectPath: "/repo/b", modelKey: "m/b", actor: "advisor" },
		);

		expect(summary.records.map((item) => item.id)).toEqual(["r2"]);
	});
});

describe("metrics backfill parsing", () => {
	it("parses assistant usage from pi JSONL sessions", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-metrics-"));
		const file = join(dir, "session.jsonl");
		await writeFile(
			file,
			[
				JSON.stringify({
					type: "session",
					id: "s1",
					timestamp: "2026-07-01T09:00:00.000Z",
					cwd: "/repo/a",
				}),
				JSON.stringify({
					type: "model_change",
					id: "m1",
					timestamp: "2026-07-01T09:00:01.000Z",
					provider: "openai",
					modelId: "gpt-5",
				}),
				JSON.stringify({
					type: "thinking_level_change",
					id: "t1",
					timestamp: "2026-07-01T09:00:02.000Z",
					thinkingLevel: "high",
				}),
				JSON.stringify({
					type: "message",
					id: "a1",
					timestamp: "2026-07-01T09:00:05.000Z",
					message: {
						role: "assistant",
						model: "gpt-5.5",
						usage: {
							input: 10,
							output: 20,
							cacheRead: 3,
							cacheWrite: 4,
							reasoning: 5,
							totalTokens: 37,
							cost: { total: 0.0123 },
						},
						content: [{ type: "text", text: "done" }, { type: "toolCall" }],
					},
				}),
			].join("\n"),
			"utf-8",
		);

		const records = await parseSessionFile(file);

		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			id: `backfill:${file}:a1`,
			source: "backfill",
			projectPath: "/repo/a",
			sessionId: "s1",
			modelKey: "gpt-5.5",
			thinkingLevel: "high",
			durationMs: null,
			tps: null,
			cost: 0.0123,
			toolCalls: 1,
		});
		expect(records[0].tokens.total).toBe(37);
	});
});

describe("metric record builders", () => {
	it("creates worker deltas and TPS from cumulative stats", () => {
		const built = workerMetricRecord({
			id: "run1",
			projectPath: "/repo/a",
			startedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
			endedAtMs: Date.parse("2026-07-01T10:00:05.000Z"),
			model: { provider: "openai", id: "gpt-5" },
			thinkingLevel: "medium",
			mode: "normal",
			requestMode: "prompt",
			status: "completed",
			before: { tokens: { input: 10, output: 20, total: 30 }, cost: 1, toolCalls: 1 },
			after: { tokens: { input: 30, output: 70, total: 100 }, cost: 1.25, toolCalls: 3 },
		});

		expect(built.tokens.output).toBe(50);
		expect(built.cost).toBeCloseTo(0.25);
		expect(built.toolCalls).toBe(2);
		expect(built.tps).toBe(10);
	});

	it("creates advisor records with severity and action", () => {
		const built = advisorMetricRecord({
			id: "adv1",
			projectPath: "/repo/a",
			startedAtMs: Date.parse("2026-07-01T10:00:00.000Z"),
			endedAtMs: Date.parse("2026-07-01T10:00:01.000Z"),
			model: { provider: "openai", id: "gpt-5" },
			thinkingLevel: "medium",
			severity: "blocker",
			action: "prompt",
			status: "completed",
			before: { tokens: { input: 0, output: 0, total: 0 }, cost: 0 },
			after: { tokens: { input: 5, output: 8, total: 13 }, cost: 0.02 },
		});

		expect(built.actor).toBe("advisor");
		expect(built.advisorSeverity).toBe("blocker");
		expect(built.advisorAction).toBe("prompt");
		expect(built.tokens.total).toBe(13);
		expect(built.tps).toBeNull();
	});
});
