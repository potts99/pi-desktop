import { exec, execFile } from "node:child_process";
import { getSettings, updateSettings } from "./settings-store.ts";
import { getAdvisorConfig, updateAdvisorConfig } from "./advisor-store.ts";
import { getSystemPrompt, updateSystemPrompt } from "./system-prompt-store.ts";
import { getMetricsSummary, refreshMetricsBackfill } from "./metrics-store.ts";
import { listSlashCommands } from "./slash-resources.ts";

import { ipcMain, dialog, type BrowserWindow } from "electron";
import type { FSWatcher } from "node:fs";
import { listWorkspaces, addWorkspace, removeWorkspace } from "./workspaces.ts";
import {
	listSessions,
	listWorkspaceFiles,
	sessionDirFor,
	watchDir,
} from "./sessions.ts";
import { getPinned, togglePin } from "./pinned.ts";
import * as rt from "./session-runtime.ts";

function git(cwd: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("git", ["-C", cwd, ...args], (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr.trim() || error.message));
				return;
			}
			resolve(stdout.trim());
		});
	});
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
	const emit = (sessionKey: string, ev: unknown) =>
		getWindow()?.webContents.send("session-event", sessionKey, ev);

	const watchers = new Map<string, FSWatcher>();

	// Lazily attach a filesystem watcher for a workspace's session dir so
	// externally-created sessions refresh the sidebar. No-op if already watching
	// or the dir doesn't exist yet.
	async function ensureWatch(cwd: string): Promise<void> {
		if (watchers.has(cwd)) return;
		const dir = await sessionDirFor(cwd);
		if (!dir) return;
		const w = watchDir(dir, () =>
			getWindow()?.webContents.send("sessions-changed", cwd),
		);
		if (w) watchers.set(cwd, w);
	}

	ipcMain.handle("listWorkspaces", () => listWorkspaces());

	ipcMain.handle("removeWorkspace", (_e, path: string) =>
		removeWorkspace(path),
	);

	ipcMain.handle("addWorkspace", async () => {
		const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
		if (res.canceled || !res.filePaths[0]) return listWorkspaces();
		const path = res.filePaths[0];
		const list = addWorkspace(path);
		await ensureWatch(path);
		return list;
	});

	ipcMain.handle("listSessions", async (_e, cwd: string) => {
		await ensureWatch(cwd);
		return listSessions(cwd);
	});

	ipcMain.handle("openSession", (_e, arg) => rt.openSession(arg, emit));
	ipcMain.handle("closeSession", (_e, key: string) => rt.closeSession(key));
	ipcMain.handle(
		"sendPrompt",
		(_e, key: string, text: string, mode?: "prompt" | "steer" | "followUp") => {
			if (mode === "steer") return rt.steer(key, text);
			if (mode === "followUp") return rt.followUp(key, text);
			return rt.sendPrompt(key, text);
		},
	);
	ipcMain.handle("abortSession", (_e, key: string) => rt.abortSession(key));
	ipcMain.handle("respondToUiRequest", (_e, key: string, response) =>
		rt.respondToUiRequest(key, response),
	);
	ipcMain.handle("getModels", (_e, key: string) => rt.getModels(key));
	ipcMain.handle("setModel", (_e, key: string, provider: string, id: string) =>
		rt.setModel(key, provider, id),
	);
	ipcMain.handle("getSessionState", (_e, key: string) =>
		rt.getSessionState(key),
	);
	ipcMain.handle("setThinkingLevel", (_e, key: string, level) =>
		rt.setThinkingLevel(key, level),
	);
	ipcMain.handle("setMode", (_e, key: string, mode) => rt.setMode(key, mode));
	ipcMain.handle("cycleThinkingLevel", (_e, key: string) =>
		rt.cycleThinkingLevel(key),
	);
	ipcMain.handle("forkSession", (_e, key: string, entryId: string) =>
		rt.forkSession(key, entryId),
	);
	ipcMain.handle("cloneSession", (_e, key: string) => rt.cloneSession(key));
	ipcMain.handle("renameSession", (_e, key: string, name: string) =>
		rt.renameSession(key, name),
	);
	ipcMain.handle("deleteSession", (_e, sessionPath: string) =>
		rt.deleteSession(sessionPath),
	);
	ipcMain.handle("listWorkspaceFiles", (_e, cwd: string, prefix: string) =>
		listWorkspaceFiles(cwd, prefix),
	);
	ipcMain.handle("listSlashCommands", (_e, cwd: string | null) =>
		listSlashCommands(cwd),
	);
	ipcMain.handle("listGitBranches", async (_e, cwd: string) => {
		const [current, branchList] = await Promise.all([
			git(cwd, ["branch", "--show-current"]).catch(() => ""),
			git(cwd, [
				"for-each-ref",
				"--format=%(refname:short)",
				"refs/heads",
			]).catch(() => ""),
		]);
		return {
			current: current || null,
			branches: branchList.split("\n").filter(Boolean),
		};
	});
	ipcMain.handle(
		"checkoutGitBranch",
		async (_e, cwd: string, branch: string) => {
			await git(cwd, ["checkout", branch]);
		},
	);
	ipcMain.handle("getLastAssistantText", (_e, key: string) =>
		rt.getLastAssistantText(key),
	);
	ipcMain.handle("getSettings", () => getSettings());
	ipcMain.handle("getAdvisorConfig", () => getAdvisorConfig());
	ipcMain.handle("updateAdvisorConfig", (_e, partial) =>
		updateAdvisorConfig(partial),
	);
	ipcMain.handle("getSystemPrompt", () => getSystemPrompt());
	ipcMain.handle("updateSystemPrompt", (_e, systemPrompt: string) =>
		updateSystemPrompt(systemPrompt),
	);
	ipcMain.handle("updateSettings", (_e, partial) => updateSettings(partial));
	ipcMain.handle("getSessionStats", (_e, key: string) =>
		rt.getSessionStats(key),
	);
	ipcMain.handle("getMetricsSummary", (_e, filter) =>
		getMetricsSummary(filter),
	);
	ipcMain.handle("refreshMetricsBackfill", (_e, filter) =>
		refreshMetricsBackfill(filter),
	);
	ipcMain.handle("getPinned", () => getPinned());
	ipcMain.handle("togglePin", (_e, path: string) => togglePin(path));
	ipcMain.handle("closeWindow", () => {
		getWindow()?.close();
	});
	ipcMain.handle("maximizeWindow", () => {
		getWindow()?.maximize();
	});
	ipcMain.handle("minimizeWindow", () => {
		getWindow()?.minimize();
	});
	ipcMain.handle("unmaximizeWindow", () => {
		getWindow()?.unmaximize();
	});
	ipcMain.handle("isMaximized", () => getWindow()?.isMaximized() ?? false);
	ipcMain.handle("isFullScreen", () => getWindow()?.isFullScreen() ?? false);

	// ponytail: exec('code'), fallback to 'open -a "Visual Studio Code"' if code not on PATH
	ipcMain.handle("openInVSCode", (_e, path: string) => {
		return new Promise<void>((resolve, reject) => {
			exec(`code "${path}"`, (err) => {
				if (err) {
					exec(`open -a "Visual Studio Code" "${path}"`, (err2) => {
						if (err2) reject(new Error(err2.message));
						else resolve();
					});
				} else {
					resolve();
				}
			});
		});
	});

	ipcMain.handle("isVSCodeAvailable", () => {
		return new Promise<boolean>((resolve) => {
			exec("command -v code", (err) => {
				if (!err) {
					resolve(true);
					return;
				}
				// ponytail: check macOS app bundle as fallback
				exec('test -d "/Applications/Visual Studio Code.app"', (err2) => {
					resolve(!err2);
				});
			});
		});
	});

	ipcMain.handle("getSharedModels", (_e, sessionKey?: string) =>
		rt.getAllModelChoices(sessionKey),
	);
}
