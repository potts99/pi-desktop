import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
	loadSkills,
	parseFrontmatter,
	stripFrontmatter,
	type Skill,
} from "@earendil-works/pi-coding-agent";
export type { Skill } from "@earendil-works/pi-coding-agent";
import type { SlashCommand } from "../shared/types.ts";
import { getSettings, type PiSettings } from "./settings-store.ts";

export interface PromptTemplate {
	name: string;
	description: string;
	argumentHint?: string;
	content: string;
}

const agentDir = join(homedir(), ".pi", "agent");
const CACHE_TTL_MS = 30_000;

function resolveUserPath(path: string, cwd: string): string {
	return resolve(
		path.replace(/^~(?=\/|$)/, homedir()).replace(/^\.(?=\/|$)/, cwd),
	);
}

export function parseCommandArgs(argsString: string): string[] {
	const matches = argsString.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g);
	return [...matches].map((match) => match[1] ?? match[2] ?? match[3]);
}

export function substituteArgs(content: string, args: string[]): string {
	const allArgs = args.join(" ");
	return content.replace(
		/\$\{(\d+):-([^}]*)\}|\$\{@:(\d+)(?::(\d+))?\}|\$(ARGUMENTS|@|\d+)/g,
		(_match, defaultNumber, defaultValue, sliceStart, sliceLength, simple) => {
			if (defaultNumber) return args[Number(defaultNumber) - 1] || defaultValue;
			if (sliceStart) {
				const start = Math.max(0, Number(sliceStart) - 1);
				return args
					.slice(start, sliceLength ? start + Number(sliceLength) : undefined)
					.join(" ");
			}
			if (simple === "ARGUMENTS" || simple === "@") return allArgs;
			return args[Number(simple) - 1] ?? "";
		},
	);
}

async function loadPromptFile(
	filePath: string,
): Promise<PromptTemplate | null> {
	try {
		const rawContent = await readFile(filePath, "utf-8");
		const { frontmatter, body } = parseFrontmatter(rawContent);
		const firstLine = body.split("\n").find((line) => line.trim()) ?? "";
		const description =
			typeof frontmatter.description === "string"
				? frontmatter.description
				: firstLine.slice(0, 60);
		return {
			name: basename(filePath, ".md"),
			description,
			argumentHint:
				typeof frontmatter["argument-hint"] === "string"
					? frontmatter["argument-hint"]
					: undefined,
			content: body,
		};
	} catch {
		return null;
	}
}

async function loadPromptDir(dir: string): Promise<PromptTemplate[]> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		const files = entries.flatMap((entry) =>
			entry.isFile() && entry.name.endsWith(".md")
				? [loadPromptFile(join(dir, entry.name))]
				: [],
		);
		const templates = await Promise.all(files);
		return templates.filter((template): template is PromptTemplate =>
			Boolean(template),
		);
	} catch {
		return [];
	}
}

async function loadPromptPath(
	path: string,
	cwd: string,
): Promise<PromptTemplate[]> {
	const resolvedPath = resolveUserPath(path, cwd);
	try {
		const stats = await stat(resolvedPath);
		if (stats.isDirectory()) return loadPromptDir(resolvedPath);
		if (stats.isFile() && resolvedPath.endsWith(".md")) {
			const template = await loadPromptFile(resolvedPath);
			return template ? [template] : [];
		}
	} catch {
		return [];
	}
	return [];
}

// Last entry for a name wins, so project-local / explicit prompts override a
// global prompt with the same filename — the same precedence the TUI applies.
function dedupeByName(templates: PromptTemplate[]): PromptTemplate[] {
	const byName = new Map<string, PromptTemplate>();
	for (const template of templates) byName.set(template.name, template);
	return [...byName.values()];
}

function loadSkillList(cwd: string, settings: PiSettings): Skill[] {
	if (settings.enableSkillCommands === false) return [];
	return loadSkills({
		cwd,
		agentDir,
		skillPaths: Array.isArray(settings.skills) ? settings.skills : [],
		includeDefaults: true,
	}).skills;
}

// Reads settings once and returns both resources, so list + expand never pay
// for two getSettings round-trips on the same request.
async function loadResourcesUncached(cwd: string): Promise<{
	templates: PromptTemplate[];
	skills: Skill[];
}> {
	const settings = await getSettings();
	const promptPaths = Array.isArray(settings.prompts) ? settings.prompts : [];
	const explicitPrompts = await Promise.all(
		promptPaths.map((path) => loadPromptPath(path, cwd)),
	);
	const templates = dedupeByName([
		...(await loadPromptDir(join(agentDir, "prompts"))),
		...(await loadPromptDir(join(cwd, ".pi", "prompts"))),
		...explicitPrompts.flat(),
	]);
	return { templates, skills: loadSkillList(cwd, settings) };
}

// ponytail: 30s per-cwd cache. The hot path is expandSlashCommand on every
// message send, which would otherwise re-scan cwd for SKILL.md each time.
// Ceiling: edits to prompt/skill files take up to 30s (or a window refocus in
// the renderer, which re-queries) to appear. Drop the cache if live edits matter.
interface CachedResources {
	templates: PromptTemplate[];
	skills: Skill[];
	expiresAt: number;
}
const resourceCache = new Map<string, CachedResources>();

async function loadResources(cwd: string): Promise<{
	templates: PromptTemplate[];
	skills: Skill[];
}> {
	const cached = resourceCache.get(cwd);
	if (cached && cached.expiresAt > Date.now()) return cached;
	const fresh = await loadResourcesUncached(cwd);
	resourceCache.set(cwd, { ...fresh, expiresAt: Date.now() + CACHE_TTL_MS });
	return fresh;
}

export async function listSlashCommands(
	cwd: string | null,
): Promise<SlashCommand[]> {
	const workingDir = cwd ?? homedir();
	const { templates, skills } = await loadResources(workingDir);
	return [
		...templates.map((prompt) => ({
			id: `prompt:${prompt.name}`,
			label: `/${prompt.name}`,
			description: prompt.argumentHint
				? `Prompt · ${prompt.description} · ${prompt.argumentHint}`
				: `Prompt · ${prompt.description}`,
		})),
		...skills.map((skill) => ({
			id: `skill:${skill.name}`,
			label: `/skill:${skill.name}`,
			description: `Skill · ${skill.description}`,
		})),
	];
}

export function expandPromptTemplate(
	text: string,
	templates: PromptTemplate[],
): string {
	const match = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
	if (!match) return text;
	const template = templates.find((prompt) => prompt.name === match[1]);
	return template
		? substituteArgs(template.content, parseCommandArgs(match[2] ?? ""))
		: text;
}

export async function expandSkillCommand(
	text: string,
	skills: Skill[],
): Promise<string> {
	if (!text.startsWith("/skill:")) return text;
	const spaceIndex = text.indexOf(" ");
	const skillName =
		spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
	const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
	const skill = skills.find((candidate) => candidate.name === skillName);
	if (!skill) return text;
	const body = stripFrontmatter(await readFile(skill.filePath, "utf-8")).trim();
	const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${dirname(skill.filePath)}.\n\n${body}\n</skill>`;
	return args ? `${skillBlock}\n\n${args}` : skillBlock;
}

export async function expandSlashCommand(
	cwd: string | null,
	text: string,
): Promise<string> {
	if (!text.startsWith("/")) return text;
	const workingDir = cwd ?? homedir();
	const { templates, skills } = await loadResources(workingDir);
	return expandPromptTemplate(
		await expandSkillCommand(text, skills),
		templates,
	);
}
