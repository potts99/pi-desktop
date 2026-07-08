# Add persisted elapsed working time to thread status row

## Goal

Show how long the active thread has been working next to the existing `Working · provider/model` row in the transcript, and persist the start time across app reloads/reconnects.

Target display:

```text
Working · 0:12 · provider/model
```

When no model is known:

```text
Working · 0:12
```

On completion, keep the existing `Done` behavior.

## Current code paths

- `src/main/session-runtime.ts`
  - Owns open session entries and emits `SessionEvent`s.
  - `state(entry)` maps agent RPC state into shared `SessionState`.
  - `sendPrompt`, `steer`, and `followUp` start agent work.
  - `abortSession`, `agent_end`, and error events stop agent work.
- `src/shared/types.ts`
  - `SessionState` is sent from main to renderer.
  - `TabState` is the renderer tab state shape.
- `src/renderer/state/useSessions.ts`
  - `freshTab` initializes per-tab renderer state.
  - Session events update `streaming`, `streamingText`, and `activeModel`.
- `src/renderer/App.tsx`
  - Passes active tab state into `Transcript`.
- `src/renderer/components/Transcript.tsx`
  - `Transcript` renders `<WorkIndicator active={streaming} model={activeModel} />`.
  - `WorkIndicator` owns the spinner/done state and currently builds:
    - `Working`
    - `Working · provider/model`
    - `Done`

## Recommended design

Persist a backend-owned timestamp and expose it through existing session state:

```ts
workingStartedAt: number | null;
```

Store it in main process state, not in `WorkIndicator`, so elapsed time survives tab switches. Persist it to a tiny desktop sidecar JSON so it also survives app reloads and reconnects.

Recommended sidecar path:

```text
~/.pi/agent/pi-desktop-session-work.json
```

Suggested shape:

```json
{
  "/absolute/path/to/session.jsonl": 1720450000000
}
```

Use the session file path as the key. If a session has no `sessionPath` yet, keep the timestamp only in memory until `state(entry)` learns `s.sessionFile`, then persist it.

## Implementation steps

1. Update `src/shared/types.ts`
   - Add `workingStartedAt: number | null` to `SessionState`.
   - Add `workingStartedAt: number | null` to `TabState`.

2. Update `src/main/session-runtime.ts`
   - Extend `Entry` with `workingStartedAt: number | null`.
   - Add minimal helpers local to this file:
     - `readWorkingStarts(): Promise<Record<string, number>>`
     - `writeWorkingStarts(starts: Record<string, number>): Promise<void>`
     - `persistWorkingStartedAt(entry): Promise<void>`
     - `clearPersistedWorkingStartedAt(entry): Promise<void>`
   - Store the sidecar under `join(homedir(), ".pi", "agent", "pi-desktop-session-work.json")`.
   - Validate loaded values: keep only finite positive numbers.

3. Set/clear the backend timestamp
   - On `sendPrompt`, `steer`, and `followUp`:
     - Set `entry.workingStartedAt = Date.now()` before calling the RPC method.
     - Persist it if `entry.sessionPath` is known.
     - Emit `{ kind: "sessionState", state: { isStreaming: true, workingStartedAt } }` so the renderer updates before the first delta.
   - On `agent_end`:
     - Clear `entry.workingStartedAt`.
     - Delete the persisted entry.
     - Emit the existing `idle` event.
   - On error events that stop work:
     - Clear `entry.workingStartedAt`.
     - Delete the persisted entry.
     - Emit the existing `error` event.
   - On `abortSession` success:
     - Clear `entry.workingStartedAt`.
     - Delete the persisted entry.

4. Restore the timestamp on open/state
   - In `openSession`, initialize `entry.workingStartedAt = null`.
   - In `state(entry)`:
     - Update `entry.sessionPath = s.sessionFile` as it does today.
     - If `s.isStreaming` and `entry.workingStartedAt` is null, load the persisted timestamp for `s.sessionFile`.
     - If `s.isStreaming` and no persisted value exists, set `entry.workingStartedAt = Date.now()` and persist it.
     - If `!s.isStreaming`, clear `entry.workingStartedAt` and delete persisted state for this session.
     - Return `workingStartedAt: entry.workingStartedAt` in `SessionState`.
   - Keep fallback `SessionState` objects returning `workingStartedAt: null`.

5. Update `src/renderer/state/useSessions.ts`
   - In `freshTab`, initialize `workingStartedAt: null`.
   - On `sessionState`, copy `ev.state.workingStartedAt` when provided.
   - On `assistantDelta`, do not create a renderer timestamp unless missing from old backend state; prefer backend state.
     - Safe fallback: `workingStartedAt: t.workingStartedAt ?? Date.now()`.
   - On `idle`, `error`, and successful `abort`, clear `workingStartedAt: null`.
   - When opening a session, set `tab.workingStartedAt = state.workingStartedAt`.
   - Expose `workingStartedAt` for the active tab near `streaming` and `streamingText`.

6. Update `src/renderer/App.tsx`
   - Pass `workingStartedAt={s.workingStartedAt}` into `Transcript`.

7. Update `src/renderer/components/Transcript.tsx`
   - Add `workingStartedAt?: number | null` to `Transcript` props.
   - Pass it into `WorkIndicator`.
   - Add `workingStartedAt` to `WorkIndicator` props.
   - Add a one-second tick while `phase === "active"` so elapsed text updates.
   - Format elapsed time locally:
     - `< 1 hour`: `m:ss`
     - `>= 1 hour`: `h:mm:ss`
   - Build active text as:
     - `Working · ${elapsed} · ${label}` when elapsed and model exist
     - `Working · ${elapsed}` when only elapsed exists
     - Existing model-only fallback if timestamp is missing

## Suggested UI helper

Keep this local to `Transcript.tsx`; no new shared utility needed.

```ts
function formatElapsed(milliseconds: number): string {
 const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
 const seconds = totalSeconds % 60;
 const totalMinutes = Math.floor(totalSeconds / 60);
 const minutes = totalMinutes % 60;
 const hours = Math.floor(totalMinutes / 60);

 if (hours > 0) {
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
 }

 return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
```

## Tests/checks

Add the smallest useful tests if existing test setup makes it cheap:

- `src/main/session-runtime.test.ts`
  - Starts work sets and returns `workingStartedAt`.
  - Reopening a streaming session restores the timestamp from the sidecar.
  - `agent_end`/abort clears the persisted timestamp.
- `src/renderer/state/useSessions.test.tsx`
  - `sessionState` copies `workingStartedAt` into tab state.
  - `idle` clears it.

Run:

```bash
npm run typecheck
npm test
```

Manual smoke check:

- Send a prompt.
- Confirm the row shows `Working · 0:00 · provider/model`, then increments once per second.
- Switch to another tab and back while the thread is working; elapsed time should not reset.
- Quit/reopen the app while a session is still streaming; elapsed time should continue from the original persisted start time.
- Abort or wait for completion; row should clear after existing `Done` behavior.

## Deferred

- Persisting historical completed durations.
- Styling changes; the existing row style is sufficient.
