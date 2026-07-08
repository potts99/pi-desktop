import { useState, useEffect } from "react";
import {
	Plus,
	Trash2,
	Pin,
	Settings,
	BarChart3,
	ChevronDown,
	ChevronRight,
} from "lucide-react";
import type { WorkspaceGroup } from "../../shared/types.ts";

const COLLAPSED_LIMIT = 4;
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function StreamDot() {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const id = setInterval(
			() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length),
			80,
		);
		return () => clearInterval(id);
	}, []);
	return <span className="streaming-dot">{BRAILLE_FRAMES[frame]}</span>;
}

function SessionRow({
	path,
	active,
	streaming,
	pinned,
	title,
	subtitle,
	onOpen,
	onTogglePin,
}: {
	path: string;
	active: boolean;
	streaming: boolean;
	pinned: boolean;
	title: string;
	subtitle: string;
	onOpen: (path: string) => void;
	onTogglePin: (path: string) => void;
}) {
	const [hovered, setHovered] = useState(false);
	const showPin = hovered || (pinned && !streaming);
	const showSpinner = streaming && !hovered;

	return (
		<div
			className="session-row-wrap"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<span className="row-slot">
				{showSpinner && <StreamDot />}
				{showPin && (
					<button
						className={`pin-btn${pinned ? " pinned" : ""}`}
						onClick={(e) => {
							e.stopPropagation();
							onTogglePin(path);
						}}
						title={pinned ? "Unpin" : "Pin"}
					>
						<Pin size={12} fill={pinned ? "currentColor" : undefined} />
					</button>
				)}
			</span>
			<button
				className={`session-row${active ? " selected" : ""}`}
				onClick={() => onOpen(path)}
				title={title}
			>
				<span className="s-title">{title}</span>
				<span className="s-sub">{subtitle}</span>
			</button>
		</div>
	);
}

export function Sidebar({
	groups,
	activePath,
	pinnedPaths,
	streamingPaths,
	onNewAgent,
	onAddWorkspace,
	onRemoveWorkspace,
	onOpen,
	onNew,
	onTogglePin,
	onOpenSettings,
	onOpenMetrics,
}: {
	groups: WorkspaceGroup[];
	activePath: string | null;
	pinnedPaths: string[];
	streamingPaths: Set<string>;
	onNewAgent: () => void;
	onAddWorkspace: () => void;
	onRemoveWorkspace: (path: string) => void;
	onOpen: (path: string) => void;
	onNew: (cwd: string) => void;
	onTogglePin: (path: string) => void;
	onOpenSettings: () => void;
	onOpenMetrics: () => void;
}) {
	const allSessions = groups.flatMap((g) =>
		g.sessions.map((s) => ({ ...s, cwd: g.path })),
	);
	const pinned = allSessions.filter((s) => pinnedPaths.includes(s.path));
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
	const toggleGroup = (path: string) =>
		setExpandedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const toggleCollapse = (path: string) =>
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});

	return (
		<div className="sidebar">
			<div className="sidebar-top">
				<button className="nav-item nav-primary" onClick={onNewAgent}>
					<span className="nav-icon">
						<Plus size={16} />
					</span>
					New Agent
				</button>
			</div>

			<div className="sidebar-scroll">
				{pinned.length > 0 && (
					<>
						<div className="section-head">Pinned</div>
						{pinned.map((s) => (
							<SessionRow
								key={s.path}
								path={s.path}
								active={s.path === activePath}
								streaming={streamingPaths.has(s.path)}
								pinned={true}
								title={s.title}
								subtitle={s.subtitle}
								onOpen={onOpen}
								onTogglePin={onTogglePin}
							/>
						))}
						<div className="section-head section-head-action">
							<span>Workspaces</span>
							<button
								className="section-add-btn"
								onClick={onAddWorkspace}
								title="Add workspace"
							>
								<Plus size={14} />
							</button>
						</div>
					</>
				)}
				{pinned.length === 0 && (
					<div className="section-head section-head-action">
						<span>Workspaces</span>
						<button
							className="section-add-btn"
							onClick={onAddWorkspace}
							title="Add workspace"
						>
							<Plus size={14} />
						</button>
					</div>
				)}
				{groups.length === 0 && (
					<div className="empty-hint">
						<div>No workspaces yet. Add one to see its agents.</div>
						<button className="empty-action" onClick={onAddWorkspace}>
							Add Workspace
						</button>
					</div>
				)}
				{groups.map((g) => {
					const nonPinned = g.sessions.filter(
						(s) => !pinnedPaths.includes(s.path),
					);
					const isCollapsed = collapsedGroups.has(g.path);
					const isExpanded = expandedGroups.has(g.path);
					const shown = isCollapsed
						? []
						: isExpanded
							? nonPinned
							: nonPinned.slice(0, COLLAPSED_LIMIT);
					const hiddenCount = nonPinned.length - COLLAPSED_LIMIT;
					return (
						<div key={g.path} className="ws-group">
							<div className="ws-head">
								<button
									className="ws-name"
									onClick={() => toggleCollapse(g.path)}
									title={
										isCollapsed ? `Expand ${g.name}` : `Collapse ${g.name}`
									}
									aria-label={
										isCollapsed ? `Expand ${g.name}` : `Collapse ${g.name}`
									}
								>
									<span className="ws-icon">
										{isCollapsed ? (
											<ChevronRight size={12} />
										) : (
											<ChevronDown size={12} />
										)}
									</span>
									{g.name}
									{isCollapsed && nonPinned.length > 0 && (
										<span className="ws-count">{nonPinned.length}</span>
									)}
								</button>
								<div className="ws-actions">
									<button
										className="ws-archive"
										onClick={() => onRemoveWorkspace(g.path)}
										title={`Remove ${g.name}`}
										aria-label={`Remove ${g.name}`}
									>
										<Trash2 size={14} />
									</button>
									<button
										className="ws-new"
										onClick={() => onNew(g.path)}
										title={`New agent in ${g.name}`}
										aria-label={`New agent in ${g.name}`}
									>
										<Plus size={14} />
									</button>
								</div>
							</div>
							{shown.map((s) => (
								<SessionRow
									key={s.path}
									path={s.path}
									active={s.path === activePath}
									streaming={streamingPaths.has(s.path)}
									pinned={false}
									title={s.title}
									subtitle={s.subtitle}
									onOpen={onOpen}
									onTogglePin={onTogglePin}
								/>
							))}
							{!isCollapsed && hiddenCount > 0 && (
								<button
									className="ws-more-btn"
									onClick={() => toggleGroup(g.path)}
								>
									{isExpanded ? (
										<ChevronDown size={12} />
									) : (
										<ChevronRight size={12} />
									)}
									{isExpanded ? "Show less" : `+${hiddenCount} more`}
								</button>
							)}
						</div>
					);
				})}
			</div>

			<div className="sidebar-footer">
				<div className="avatar">pi</div>
				<div className="who">
					<div className="who-name">pi-desktop</div>
					<div className="who-plan">local agent</div>
				</div>
				<button
					className="sidebar-settings-btn"
					onClick={onOpenMetrics}
					title="Metrics"
				>
					<BarChart3 size={16} />
				</button>
				<button
					className="sidebar-settings-btn"
					onClick={onOpenSettings}
					title="Settings"
				>
					<Settings size={16} />
				</button>
			</div>
		</div>
	);
}
