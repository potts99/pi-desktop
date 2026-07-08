import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetricsDashboard } from "./MetricsDashboard.tsx";
import type { MetricsSummary } from "../../shared/types.ts";

function summary(over: Partial<MetricsSummary> = {}): MetricsSummary {
	const tokens = {
		input: 10,
		output: 20,
		cacheRead: 3,
		cacheWrite: 4,
		reasoning: 0,
		total: 37,
	};
	return {
		filter: {},
		generatedAt: "2026-07-01T10:00:00.000Z",
		totals: {
			runs: 1,
			cost: 0.12,
			tokens,
			averageTps: 4,
			tpsSamples: 1,
			activeProjects: 1,
			advisorReviews: 1,
			advisorInterventions: 1,
		},
		dailyBuckets: [],
		heatmapCells: [
			{ day: "2026-07-01", level: 4, runs: 1, cost: 0.12, tokens },
		],
		projectRows: [
			{
				projectPath: "/repo/a",
				projectName: "a",
				runs: 1,
				cost: 0.12,
				tokens,
				averageTps: 4,
				topModelKey: "openai/gpt-5",
				lastUsedAt: "2026-07-01T10:00:00.000Z",
			},
		],
		modelRows: [
			{
				modelKey: "openai/gpt-5",
				runs: 1,
				cost: 0.12,
				tokens,
				averageTps: 4,
				lastUsedAt: "2026-07-01T10:00:00.000Z",
			},
		],
		advisorRows: [
			{
				modelKey: "openai/gpt-5",
				reviews: 1,
				interventions: 1,
				cost: 0.12,
				tokens,
				averageDurationMs: 500,
				severityCounts: { none: 0, nit: 0, concern: 1, blocker: 0 },
				lastUsedAt: "2026-07-01T10:00:00.000Z",
			},
		],
		records: [
			{
				id: "r1",
				source: "observed",
				actor: "worker",
				status: "completed",
				projectPath: "/repo/a",
				startedAt: "2026-07-01T09:59:55.000Z",
				endedAt: "2026-07-01T10:00:00.000Z",
				day: "2026-07-01",
				modelKey: "openai/gpt-5",
				durationMs: 5000,
				tps: 4,
				tokens,
				cost: 0.12,
				toolCalls: 1,
				toolResults: 1,
			},
		],
		...over,
	};
}

beforeEach(() => {
	(globalThis as any).window = (globalThis as any).window || {};
	(globalThis as any).window.pi = {
		getMetricsSummary: vi.fn(async () => summary()),
		refreshMetricsBackfill: vi.fn(async () =>
			summary({ totals: { ...summary().totals, runs: 2 } }),
		),
	};
});

afterEach(() => {
	cleanup();
});

describe("MetricsDashboard", () => {
	it("renders summary rows from the metrics API", async () => {
		render(<MetricsDashboard onClose={() => {}} />);

		await waitFor(() => expect(screen.getByText("Metrics")).toBeTruthy());
		expect(screen.getAllByText("openai/gpt-5").length).toBeGreaterThan(0);
		expect(screen.getAllByText("a").length).toBeGreaterThan(0);
		expect(screen.getAllByText("$0.1200").length).toBeGreaterThan(0);
	});

	it("refreshes historical backfill", async () => {
		render(<MetricsDashboard onClose={() => {}} />);
		await waitFor(() => expect(screen.getByText("Metrics")).toBeTruthy());

		fireEvent.click(screen.getByTitle("Refresh backfill"));

		await waitFor(() =>
			expect(window.pi.refreshMetricsBackfill).toHaveBeenCalledTimes(1),
		);
	});
});
