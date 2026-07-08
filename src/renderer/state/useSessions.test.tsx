import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type {
	SessionEvent,
	SessionState,
	TranscriptMessage,
} from "../../shared/types.ts";
import { useSessions } from "./useSessions.ts";

type EventCb = (sessionKey: string, ev: SessionEvent) => void;

interface MockSession {
	sessionKey: string;
	emit: (ev: SessionEvent) => void;
}

function makeState(over: Partial<SessionState> = {}): SessionState {
	return {
		sessionPath: "/s/x.jsonl",
		thinkingLevel: "medium",
		mode: "normal",
		isStreaming: false,
		queue: { steering: [], followUp: [] },
		...over,
	};
}

function installMockPi() {
	const sessions = new Map<string, MockSession>();
	let eventCb: EventCb | null = null;
	let counter = 0;

	const pi: any = {
		listWorkspaces: async () => [],
		listSessions: async () => [],
		getSettings: async () => ({}),
		getModels: async () => [],
		getSharedModels: async () => [],
		getSessionStats: async () => null,
		listGitBranches: async () => ({ current: null, branches: [] }),
		onSessionEvent: (cb: EventCb) => {
			eventCb = cb;
			return () => {
				eventCb = null;
			};
		},
		onSessionsChanged: () => () => {},
		openSession: async (_arg: { path: string } | { newIn: string }) => {
			const sessionKey = `s${++counter}`;
			const s: MockSession = {
				sessionKey,
				emit: (ev) => eventCb?.(sessionKey, ev),
			};
			sessions.set(sessionKey, s);
			const messages: TranscriptMessage[] = [];
			return { sessionKey, messages, state: makeState() };
		},
		closeSession: async () => {},
		setModel: async () => {},
		setThinkingLevel: async () => "medium",
		sendPrompt: async (key: string) => {
			// Model real agent: stream a delta, setting streaming=true via the event path.
			sessions.get(key)?.emit({ kind: "assistantDelta", text: "x" });
		},
		respondToUiRequest: async () => {},
		abortSession: async (key: string) => {
			// Model real agent: abort produces an idle event for that session only.
			sessions.get(key)?.emit({ kind: "idle" });
		},
	};

	(globalThis as any).window.pi = pi;

	return {
		pi,
		getSession: (key: string) => sessions.get(key),
		emit: (key: string, ev: SessionEvent) => sessions.get(key)?.emit(ev),
	};
}

beforeEach(() => {
	(globalThis as any).window = (globalThis as any).window || {};
	(globalThis as any).window.pi = undefined;
	installMockPi();
});

describe("useSessions entry point", () => {
	it("starts on the new agent page", async () => {
		const mock = installMockPi();
		mock.pi.listWorkspaces = async () => ["/repo"];

		const { result } = renderHook(() => useSessions());

		await waitFor(() => expect(result.current.newThread).toBe(true));
		expect(result.current.newThreadCwd).toBe("/repo");
		expect(result.current.activeKey).toBeNull();
		expect(result.current.tabs).toHaveLength(0);
	});
});

describe("useSessions model selection", () => {
	it("keeps a new-thread model selected after opening the session", async () => {
		const mock = installMockPi();
		mock.pi.listWorkspaces = async () => ["/repo"];

		const { result } = renderHook(() => useSessions());

		await waitFor(() => expect(result.current.newThread).toBe(true));
		await act(async () => {
			await result.current.setModel("anthropic", "claude-3");
		});
		await waitFor(() => {
			expect(result.current.activeModel).toEqual({
				provider: "anthropic",
				id: "claude-3",
			});
		});
		await act(async () => {
			await result.current.send("hello");
		});

		await waitFor(() => {
			expect(result.current.tabs[0].activeModel).toEqual({
				provider: "anthropic",
				id: "claude-3",
			});
		});
	});
});

describe("useSessions abort isolation", () => {
	it("aborting one streaming session leaves the other streaming", async () => {
		const { result } = renderHook(() => useSessions());

		// Open two sessions.
		await act(async () => {
			await result.current.openSession({ path: "/s/a.jsonl" });
		});
		await act(async () => {
			await result.current.openSession({ path: "/s/b.jsonl" });
		});

		// Start both streaming: send a prompt on A, then switch and send on B.
		await act(async () => {
			result.current.activateTab(0);
			await result.current.send("hello A");
		});
		await act(async () => {
			result.current.activateTab(1);
			await result.current.send("hello B");
		});

		// Both tabs should be streaming.
		expect(result.current.tabs[0].streaming).toBe(true);
		expect(result.current.tabs[1].streaming).toBe(true);

		// Abort the active tab (B, index 1).
		await act(async () => {
			await result.current.abort();
		});

		// B stops; A keeps streaming.
		expect(result.current.tabs[1].streaming).toBe(false);
		expect(result.current.tabs[0].streaming).toBe(true);
	});
});

describe("useSessions workingStartedAt", () => {
	it("sessionState event copies workingStartedAt into tab state", async () => {
		const mock = installMockPi();
		const { result } = renderHook(() => useSessions());

		await act(async () => {
			await result.current.openSession({ path: "/s/a.jsonl" });
		});

		const key = result.current.tabs[0].sessionKey;
		const startedAt = 1_700_000_000_000;

		await act(async () => {
			mock.emit(key, {
				kind: "sessionState",
				state: { isStreaming: true, workingStartedAt: startedAt },
			});
		});

		expect(result.current.tabs[0].workingStartedAt).toBe(startedAt);
	});

	it("idle event clears workingStartedAt", async () => {
		const { result } = renderHook(() => useSessions());

		await act(async () => {
			await result.current.openSession({ path: "/s/a.jsonl" });
		});

		const key = result.current.tabs[0].sessionKey;
		await act(async () => {
			await result.current.send("hello");
		});
		expect(result.current.tabs[0].workingStartedAt).not.toBeNull();

		await act(async () => {
			await result.current.abort();
		});

		expect(result.current.tabs[0].workingStartedAt).toBeNull();
	});
});

describe("useSessions UI requests", () => {
	it("attaches UI requests to the matching tab and clears after response", async () => {
		const mock = installMockPi();
		const { result } = renderHook(() => useSessions());

		await act(async () => {
			await result.current.openSession({ path: "/s/a.jsonl" });
		});
		await act(async () => {
			await result.current.openSession({ path: "/s/b.jsonl" });
		});

		const firstKey = result.current.tabs[0].sessionKey;
		await act(async () => {
			mock.emit(firstKey, {
				kind: "uiRequest",
				request: {
					id: "ui1",
					method: "select",
					title: "Pick one",
					options: ["A"],
				},
			});
		});

		expect(result.current.tabs[0].uiRequests).toHaveLength(1);
		expect(result.current.tabs[1].uiRequests).toHaveLength(0);

		await act(async () => {
			result.current.activateTab(0);
		});
		await waitFor(() => expect(result.current.activeIdx).toBe(0));
		await act(async () => {
			await result.current.respondToUiRequest({ id: "ui1", value: "A" });
		});

		expect(result.current.tabs[0].uiRequests).toHaveLength(0);
	});
});
