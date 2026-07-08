import { useEffect, useState } from "react";
import { BarChart3, RefreshCw, X } from "lucide-react";
import type {
	MetricsActor,
	MetricsFilter,
	MetricsSummary,
	MetricsTokenUsage,
} from "../../shared/types.ts";

const emptyTokens: MetricsTokenUsage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	reasoning: 0,
	total: 0,
};

function compactNumber(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value))
		return "--";
	const abs = Math.abs(value);
	if (abs >= 1_000_000)
		return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
	if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
	return String(Math.round(value));
}

function money(value: number): string {
	return `$${value.toFixed(value >= 10 ? 2 : 4)}`;
}

function tps(value: number | null | undefined): string {
	return value === null || value === undefined ? "--" : value.toFixed(1);
}

function shortDate(value: string): string {
	return new Date(value).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function projectLabel(path: string): string {
	return path.split("/").filter(Boolean).pop() ?? path;
}

function TokenStack({ tokens = emptyTokens }: { tokens?: MetricsTokenUsage }) {
	return (
		<span className="metrics-token-stack">
			<span>↑{compactNumber(tokens.input)}</span>
			<span>↓{compactNumber(tokens.output)}</span>
			<span>R{compactNumber(tokens.cacheRead)}</span>
			<span>W{compactNumber(tokens.cacheWrite)}</span>
		</span>
	);
}

function StatTile({
	label,
	value,
	detail,
}: {
	label: string;
	value: string;
	detail?: string;
}) {
	return (
		<div className="metrics-stat">
			<div className="metrics-stat-label">{label}</div>
			<div className="metrics-stat-value">{value}</div>
			{detail && <div className="metrics-stat-detail">{detail}</div>}
		</div>
	);
}

export function MetricsDashboard({ onClose }: { onClose: () => void }) {
	const [filter, setFilter] = useState<MetricsFilter>({});
	const [summary, setSummary] = useState<MetricsSummary | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const filterKey = JSON.stringify(filter);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError(null);
		window.pi
			?.getMetricsSummary(filter)
			.then((next) => {
				if (!cancelled) setSummary(next);
			})
			.catch((err) => {
				if (!cancelled)
					setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [filterKey]);

	async function refreshBackfill() {
		setRefreshing(true);
		setError(null);
		try {
			setSummary(await window.pi.refreshMetricsBackfill(filter));
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setRefreshing(false);
		}
	}

	const totals = summary?.totals;
	const records = summary?.records ?? [];

	return (
		<div className="metrics-layout">
			<div className="metrics-topbar">
				<div className="metrics-title-wrap">
					<BarChart3 size={16} />
					<span className="metrics-title">Metrics</span>
				</div>
				<div className="metrics-actions">
					<button
						className="metrics-icon-btn"
						onClick={refreshBackfill}
						disabled={refreshing}
						title="Refresh backfill"
					>
						<RefreshCw size={15} />
					</button>
					<button className="metrics-icon-btn" onClick={onClose} title="Close">
						<X size={16} />
					</button>
				</div>
			</div>

			<div className="metrics-body">
				<div className="metrics-filters">
					<label>
						<span>From</span>
						<input
							type="date"
							value={filter.from ?? ""}
							onChange={(event) =>
								setFilter((current) => ({
									...current,
									from: event.target.value || undefined,
								}))
							}
						/>
					</label>
					<label>
						<span>To</span>
						<input
							type="date"
							value={filter.to ?? ""}
							onChange={(event) =>
								setFilter((current) => ({
									...current,
									to: event.target.value || undefined,
								}))
							}
						/>
					</label>
					<label>
						<span>Project</span>
						<select
							value={filter.projectPath ?? ""}
							onChange={(event) =>
								setFilter((current) => ({
									...current,
									projectPath: event.target.value || undefined,
								}))
							}
						>
							<option value="">All projects</option>
							{(summary?.availableProjects ?? []).map((path) => (
								<option key={path} value={path}>
									{projectLabel(path)}
								</option>
							))}
						</select>
					</label>
					<label>
						<span>Model</span>
						<select
							value={filter.modelKey ?? ""}
							onChange={(event) =>
								setFilter((current) => ({
									...current,
									modelKey: event.target.value || undefined,
								}))
							}
						>
							<option value="">All models</option>
							{(summary?.availableModels ?? []).map((model) => (
								<option key={model} value={model}>
									{model}
								</option>
							))}
						</select>
					</label>
					<label>
						<span>Actor</span>
						<select
							value={filter.actor ?? ""}
							onChange={(event) =>
								setFilter((current) => ({
									...current,
									actor: (event.target.value || undefined) as
										| MetricsActor
										| undefined,
								}))
							}
						>
							<option value="">All actors</option>
							<option value="worker">Worker</option>
							<option value="advisor">Advisor</option>
						</select>
					</label>
				</div>

				{error && <div className="metrics-error">{error}</div>}

				<div className="metrics-stat-grid">
					<StatTile
						label="Tokens"
						value={compactNumber(totals?.tokens.total)}
						detail={`${compactNumber(totals?.tokens.output)} output`}
					/>
					<StatTile label="Cost" value={money(totals?.cost ?? 0)} />
					<StatTile
						label="Runs"
						value={compactNumber(totals?.runs)}
						detail={`${compactNumber(totals?.activeProjects)} projects`}
					/>
					<StatTile
						label="TPS"
						value={tps(totals?.averageTps)}
						detail={`${compactNumber(totals?.tpsSamples)} samples`}
					/>
					<StatTile
						label="Advisor"
						value={compactNumber(totals?.advisorReviews)}
						detail={`${compactNumber(totals?.advisorInterventions)} interventions`}
					/>
				</div>

				<section className="metrics-section">
					<div className="metrics-section-head">
						<h2>Activity</h2>
						<span>
							{loading || refreshing ? "Loading" : `${records.length} records`}
						</span>
					</div>
					<div className="metrics-heatmap" aria-label="Token activity heatmap">
						{(summary?.heatmapCells ?? []).map((cell) => (
							<div
								key={cell.day}
								className={`metrics-heat-cell level-${cell.level}`}
								title={`${cell.day}: ${compactNumber(cell.tokens.total)} tokens, ${cell.runs} runs, ${money(cell.cost)}`}
							/>
						))}
					</div>
				</section>

				<div className="metrics-table-grid">
					<section className="metrics-section">
						<div className="metrics-section-head">
							<h2>Models</h2>
							<span>Total tokens</span>
						</div>
						<table className="metrics-table">
							<thead>
								<tr>
									<th>Model</th>
									<th>Tokens</th>
									<th>Runs</th>
									<th>TPS</th>
									<th>Cost</th>
									<th>Last</th>
								</tr>
							</thead>
							<tbody>
								{summary?.modelRows.slice(0, 10).map((row) => (
									<tr key={row.modelKey}>
										<td title={row.modelKey}>{row.modelKey}</td>
										<td>
											<TokenStack tokens={row.tokens} />
										</td>
										<td>{row.runs}</td>
										<td>{tps(row.averageTps)}</td>
										<td>{money(row.cost)}</td>
										<td>{shortDate(row.lastUsedAt)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>

					<section className="metrics-section">
						<div className="metrics-section-head">
							<h2>Projects</h2>
							<span>Top model</span>
						</div>
						<table className="metrics-table">
							<thead>
								<tr>
									<th>Project</th>
									<th>Tokens</th>
									<th>Runs</th>
									<th>Top</th>
									<th>Cost</th>
									<th>Last</th>
								</tr>
							</thead>
							<tbody>
								{summary?.projectRows.slice(0, 10).map((row) => (
									<tr key={row.projectPath}>
										<td title={row.projectPath}>{row.projectName}</td>
										<td>
											<TokenStack tokens={row.tokens} />
										</td>
										<td>{row.runs}</td>
										<td title={row.topModelKey}>{row.topModelKey}</td>
										<td>{money(row.cost)}</td>
										<td>{shortDate(row.lastUsedAt)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>
				</div>

				<section className="metrics-section">
					<div className="metrics-section-head">
						<h2>Advisor</h2>
						<span>Reviews and interventions</span>
					</div>
					<table className="metrics-table">
						<thead>
							<tr>
								<th>Model</th>
								<th>Reviews</th>
								<th>Actions</th>
								<th>Severity</th>
								<th>Tokens</th>
								<th>Cost</th>
								<th>Avg ms</th>
							</tr>
						</thead>
						<tbody>
							{summary?.advisorRows.map((row) => (
								<tr key={row.modelKey}>
									<td>{row.modelKey}</td>
									<td>{row.reviews}</td>
									<td>{row.interventions}</td>
									<td>
										<span className="metrics-severity">
											{row.severityCounts.nit}n {row.severityCounts.concern}c{" "}
											{row.severityCounts.blocker}b
										</span>
									</td>
									<td>
										<TokenStack tokens={row.tokens} />
									</td>
									<td>{money(row.cost)}</td>
									<td>
										{row.averageDurationMs === null
											? "--"
											: Math.round(row.averageDurationMs)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			</div>
		</div>
	);
}
