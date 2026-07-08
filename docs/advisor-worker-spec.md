# Advisor / Worker workflow — technical spec

## Higher goal

Give pi-desktop **first-class, fully-configurable Advisor/Worker support**, matching
the pattern from oh-my-pi's advisor and the Fireworks "closed-source advisor +
open-source worker" model:

- The **Worker** is the normal session agent the user already drives (its model is
  picked in the composer / `defaultModel`).
- The **Advisor** is a *second* model that reviews each completed worker turn, inspects
  the workspace read-only, and injects concise advice back into the worker session as
  steering.

**Critical constraint (already verified):** the shipped backend
`@earendil-works/pi-coding-agent@0.80.3` has **no** native advisor (`grep` for
`advisor`/`watchdog`/`modelRoles` in its `dist/` is empty; `--help` has no `--advisor`
flag). We therefore **build the advisor loop ourselves in the Electron main process**
using RPC primitives the app already drives. We do **not** swap the agent backend.

Approved product decisions:
1. **Auto-drive** — advice auto-steers the worker (`concern`/`blocker` interrupt,
   `nit` is a non-interrupting note, `none` is silent).
2. **Single advisor** for v1 (no multi-advisor `WATCHDOG.yml` roster yet).
3. **Every-turn** review when enabled (no on-demand button in v1).

## Architecture

The advisor is a second **ephemeral** `RpcClient` spawned per open session, pointed at
the same `cwd`, given read-only tools, and fed the worker's transcript delta after each
worker turn. It is the exact same `RpcClient` class already used in
`src/main/session-runtime.ts` — reuse `cliPath` and `agentEnv()` from that file.

```
worker RpcClient  --agent_end-->  AdvisorController.review()
                                      │  getEntries() delta since cursor
                                      ▼
                            advisor RpcClient.prompt(delta)
                                      │  agent_end → getLastAssistantText()
                                      ▼
                        parse "SEVERITY: <level>\n<body>"
                                      │  dedupe + consecutive cap
                                      ▼
   nit → worker.followUp(<advisory/>)     concern/blocker → worker.steer|prompt(<advisory/>)
```

Because advice is delivered through `steer`/`prompt`/`followUp`, the `<advisory>` wrapper
becomes a **real, persisted message in the worker transcript** — which is exactly what the
renderer restyles into a card (see §6). No separate event stream is required for
persistence.

Advisor spawn args (model pattern carries the thinking level via `:level`):

```ts
["--no-session", "--model", `${provider}/${id}:${thinkingLevel}`,
 "--tools", "read,grep,glob",
 "--append-system-prompt", advisorSystemPrompt]
```

`--no-session` keeps the advisor ephemeral (no session file, no sidebar entry, no
collision with the worker's session file). Read-only tools keep it a reviewer, not a
second executor.

## Data model

Config is pi-desktop–specific, so persist it in its own JSON file (mirror
`src/main/system-prompt-store.ts`, do **not** stuff it into pi's `settings.json`).

`src/main/advisor-store.ts` → `~/.pi/agent/pi-desktop-advisor.json`:

```ts
export interface AdvisorConfig {
  enabled: boolean;                          // default false
  model: { provider: string; id: string } | null;
  thinkingLevel: ThinkingLevel;              // default "medium"
  instructions: string;                      // WATCHDOG.md-equivalent, default ""
  maxConsecutive: number;                    // loop cap, default 3
}
```

`getAdvisorConfig(): Promise<AdvisorConfig>` (defaults when file missing) and
`updateAdvisorConfig(partial): Promise<AdvisorConfig>` (read-merge-write, like
`updateSettings`).

## Steps to complete

### 1. `src/main/advisor-store.ts` (new)
Implement `AdvisorConfig`, `getAdvisorConfig`, `updateAdvisorConfig` as above. Copy the
read/merge/write shape from `settings-store.ts`; copy the missing-file `catch → default`
shape from `system-prompt-store.ts`.

### 2. `src/main/advisor-runtime.ts` (new)
Owns one advisor per worker session. Export a class or per-session record:

```ts
interface AdvisorState {
  client: RpcClient | null;      // lazily spawned
  spawnedFor: string | null;     // `${provider}/${id}:${level}` the client was built for
  cursor: number;                // # of worker entries already reviewed
  recentAdvice: string[];        // normalized bodies, FIFO cap 64, dedupe
  consecutive: number;           // auto-advisories since last user turn
  reviewing: boolean;            // re-entrancy guard
}
```

Public functions:
- `resetAdvisor(state)` — stop client, zero cursor/recentAdvice/consecutive. Call on
  fork/clone/session-replacement (transcript rewrite) and on config model change.
- `noteUserTurn(state)` — set `consecutive = 0`. Called when the user sends a prompt.
- `review(state, config, worker, cwd, emit)` — the core loop:
  1. Return if `!config.enabled`, `!config.model`, or `state.reviewing`.
  2. `state.reviewing = true` (try/finally to always clear it).
  3. If `config.maxConsecutive` reached, downgrade: still review, but deliver only as a
     non-interrupting note so the loop halts and the user sees the advice.
  4. Spawn/refresh advisor client: build the `spawnFor` key; if it changed (or no
     client), stop old and `new RpcClient(...)` + `start()` with the args above and
     `advisorSystemPrompt(config.instructions)`. Wire its `onEvent` to resolve a pending
     "advisor turn done" promise on `agent_end`.
  5. `const { entries } = await worker.getEntries()`. `delta = entries.slice(cursor)`.
     `cursor = entries.length`. If delta empty → done.
  6. Format the delta to text. Reuse the block-flattening already in
     `session-runtime.ts` (`toBlocks` + the local `textOf`); export a
     `formatEntriesForAdvisor(entries): string` helper (extract/share it rather than
     duplicating). Filter out prior `<advisory>` injections so the advisor never reviews
     its own advice.
  7. `await advisorClient.prompt(deltaText)`, await the advisor `agent_end`, then
     `body = await advisorClient.getLastAssistantText()`.
  8. Parse: first line `SEVERITY: <none|nit|concern|blocker>` (case-insensitive, tolerate
     missing → treat as `none`); rest is the note.
  9. Normalize note (lowercase, collapse whitespace). If empty or in `recentAdvice` →
     stop. Else push to `recentAdvice` (FIFO 64).
  10. Deliver, wrapping the body XML-escaped as
      `<advisory severity="..." guidance="weigh, don't blindly obey">body</advisory>`:
      - `nit` → `worker.followUp(wrapped)`.
      - `concern`/`blocker` (and cap not hit) → if worker streaming `worker.steer(wrapped)`
        else `worker.prompt(wrapped)`; `state.consecutive++`.
      - cap hit → force `worker.followUp(wrapped)` regardless of severity.
  11. Optionally `emit(sessionKey, { kind: "advisory", ... })` only if you add the live
      "advisor reviewing…" indicator — the persisted record is the injected message itself.

  Advisor system prompt:
  ```
  You are the Advisor: a senior reviewer watching a worker agent solve a task in this
  workspace. You have read-only tools (read, grep, glob). After each worker turn you
  receive the new transcript delta. Investigate if needed, then reply with EXACTLY:
  SEVERITY: none|nit|concern|blocker
  <one concise note, or empty for none>

  none = no concerns (leave note empty). nit = minor/non-blocking.
  concern = likely wrong direction, missing constraint, hallucinated API.
  blocker = continuing wastes work or produces broken output.
  Stay silent (none) unless you have something concrete. Never repeat prior advice.

  <config.instructions appended here, if non-empty>
  ```

### 3. Wire into `src/main/session-runtime.ts`
- Add an `advisor: AdvisorState` to each `Entry` (init in `openSession`).
- In `wireEvents`, in the `agent_end` branch (currently emits `{ kind: "idle" }`), also
  fire `void review(entry.advisor, await getAdvisorConfig(), entry.client, entry.cwd, entry.emit)`
  (read config each turn so toggling/instruction edits apply live; a model change triggers
  respawn inside `review`). Do not `await` it in the event handler — let it run detached so
  the worker isn't blocked; the re-entrancy guard prevents overlap.
- In `sendPrompt` (the user-initiated path), call `noteUserTurn(entry.advisor)` so the
  consecutive-advisory cap resets on real user input. (Do **not** reset it on the
  advisor's own injected `prompt`/`steer`/`followUp`.)
- In `closeSession`, `forkSession`, `cloneSession`: call `resetAdvisor(entry.advisor)`
  (fork/clone rewrite the transcript; close must stop the second process to avoid leaks).

### 4. IPC + preload + types
- `src/main/ipc.ts`: `getAdvisorConfig` / `updateAdvisorConfig` handlers (copy the
  `getSettings`/`updateSettings` handler pair).
- `src/preload/index.ts`: add both to the `api` object.
- `src/shared/types.ts`:
  - Add `AdvisorConfig` and the two methods to `Api`.
  - **Do not** add an `advisories` array or a synthetic transcript kind — see §6.
  - The transient `SessionEvent` `advisory` kind is **optional**, only for a live
    "advisor reviewing…" indicator. The persisted advisory is the real transcript
    message (below), not this event.

### 5. Renderer — Settings page
`src/renderer/components/SettingsPanel.tsx`: add a page `{ id: "advisor", title: "Advisor" }`
to `pages`. Follow the existing `system-prompt` page pattern (it already has a
load-on-mount + save textarea flow). Fields:
- **Enable advisor** — toggle → `updateAdvisorConfig({ enabled })`.
- **Advisor model** — select from `sharedModels` (already fetched in this component) →
  stores `{ provider, id }`.
- **Advisor thinking** — the same 6-option thinking select used in "Model defaults".
- **Max consecutive advisories** — number (loop cap).
- **Advisor instructions** — textarea (the `WATCHDOG.md` equivalent), save-on-blur like
  the System Prompt page.

Load config with `getAdvisorConfig()` in the existing mount `useEffect`.

### 6. Renderer — advisory cards (detect-and-style, no synthetic entries)
An advisory is delivered via `worker.steer()`/`prompt()`/`followUp()`, so it becomes a
**real message in the worker transcript** — persisted in the session file and arriving
through the normal `message` event like any other message. Do **not** inject a synthetic
entry or keep a side array; that would double-render (card + raw-XML message) and require
ordering logic. Instead, detect the wrapper and restyle the real message in place. This
gives inline ordering, persistence across resume, and zero extra state for free.

- **Single source of truth — the wrapper.** The main process wraps every delivered note
  exactly as (severity + XML-escaped body):
  ```
  <advisory severity="concern" guidance="weigh, don't blindly obey">body</advisory>
  ```
- **Detection helper** (put in `src/shared/view-model.ts`, unit-tested there):
  `parseAdvisory(text): { severity, body } | null` — returns non-null iff the trimmed
  message text is a single `<advisory …>…</advisory>` element. Match the `severity`
  attribute and unescape the inner body.
- `src/renderer/components/MessageBlocks.tsx`: for a `text` block, if `parseAdvisory`
  matches, render the advisory **card** (severity color: nit=muted, concern=amber,
  blocker=red, with an "Advisor" label) instead of the raw text. These messages come back
  with `role: "user"` (steer/prompt/followUp injections), so the detection must run before
  the normal user-bubble rendering.
- Reuse existing card styling in `src/renderer/styles/glass.css`; add only the severity
  accent colors.

## What to test

### Unit (vitest — `src/main/advisor-runtime.test.ts`)
Drive `review()` with a **fake RpcClient** (plain object implementing `getEntries`,
`prompt`, `getLastAssistantText`, `steer`, `followUp`, `start`, `stop`, `onEvent`).
Assert delivery by inspecting which fake method was called with what wrapped text:
1. **Severity routing** — `nit` → `followUp`; `concern`/`blocker` → `steer` when
   streaming and `prompt` when idle.
2. **`none`/empty body** — no delivery call at all.
3. **Parse tolerance** — missing/garbled `SEVERITY:` line treated as `none`.
4. **Dedupe** — identical normalized body twice → delivered once.
5. **Consecutive cap** — after `maxConsecutive` interrupts with no `noteUserTurn`, further
   `concern`/`blocker` downgrade to `followUp` (loop halts); `noteUserTurn` resets it.
6. **Cursor** — second `review` only sends entries appended since the first; the advisor's
   own prior `<advisory>` injections are excluded from the delta.
7. **Re-entrancy** — a second `review` while one is in flight is a no-op.
8. **XML-escape** — a body containing `<`, `>`, `&` is escaped inside the `<advisory>`
   wrapper.
9. **Reset** — `resetAdvisor` stops the client and zeroes cursor/dedupe/consecutive.

**`parseAdvisory` (in `src/shared/view-model.test.ts`):** a full `<advisory severity="...">`
message parses to `{ severity, body }` with the body unescaped; a plain user message
returns `null`; a body with escaped `<`/`>`/`&` round-trips to the literal characters.
Render-side counterpart to the main-side XML-escape test (#8).

Keep existing suites green: `src/renderer/state/useSessions.test.tsx`,
`src/shared/view-model.test.ts`.

### Typecheck / build
`npm run typecheck` and `npm run test` must pass. Then `npm run build`.

### Manual E2E (packaged or `npm run dev`)
1. Settings → Advisor: enable, pick a strong advisor model + instructions, save.
2. Open a session on a real workspace, give the worker a task with a deliberate flaw
   (e.g. "use a non-existent API"). Confirm after the worker's turn an **advisory card**
   renders inline (not raw `<advisory>` XML) and a `concern`/`blocker` **steers** the
   worker to correct course. Resume the session and confirm the card persists.
3. Confirm `nit` advice appears as a card but does **not** interrupt.
4. Confirm the loop **stops** after `maxConsecutive` (no infinite advisor↔worker
   ping-pong), and resumes reviewing after the user sends a new prompt.
5. Toggle the advisor **off** mid-session → no further reviews; **on** again → resumes
   from the current transcript (not the whole history).
6. Fork/clone a session → advisor resets (no stale advice from pre-fork transcript).
7. Close the session → confirm the advisor child process exits (no orphaned `node`/`bun`).

## Out of scope for v1 (add later)
- Multi-advisor roster (`WATCHDOG.yml`), per-advisor tools/models.
- On-demand "ask advisor" button.
- Advisor cost/usage panel (`/advisor status` equivalent).
- Granting the advisor mutating tools (`edit`/`bash`).
- Per-session advisor override (v1 is a single global config).
