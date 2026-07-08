import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InputBar } from "./InputBar.tsx";

const baseProps = {
	disabled: false,
	streaming: false,
	cwd: null,
	thinkingLevel: "medium" as const,
	thinkingLevels: ["medium" as const],
	onWorkspace: vi.fn(),
	onBranch: vi.fn(),
	onSend: vi.fn(),
	onStop: vi.fn(),
	onThinking: vi.fn(),
	onCycleThinking: vi.fn(),
};

function installPi(
	commands: Array<{ id: string; label: string; description: string }>,
) {
	const pi = { listSlashCommands: vi.fn(async () => commands) };
	Object.assign(window, { pi });
	return pi;
}

describe("InputBar model picker", () => {
	it("selects models by stable provider/id keys", () => {
		const onModel = vi.fn();
		const { container } = render(
			<InputBar
				{...baseProps}
				models={[
					{ provider: "openai", id: "gpt-4o" },
					{ provider: "anthropic", id: "claude-3" },
				]}
				activeModel={{ provider: "openai", id: "gpt-4o" }}
				onModel={onModel}
			/>,
		);

		const picker = container.querySelector<HTMLSelectElement>(".model-picker");
		expect(picker?.value).toBe("openai/gpt-4o");

		fireEvent.change(picker!, { target: { value: "anthropic/claude-3" } });

		expect(onModel).toHaveBeenCalledWith("anthropic", "claude-3");
	});

	it("shows an explicit placeholder when no model is active", () => {
		const { container } = render(
			<InputBar
				{...baseProps}
				models={[{ provider: "openai", id: "gpt-4o" }]}
				activeModel={null}
				onModel={vi.fn()}
			/>,
		);

		expect(
			container.querySelector<HTMLSelectElement>(".model-picker")?.value,
		).toBe("");
	});
});

describe("InputBar slash commands", () => {
	it("shows loaded skill and prompt commands after typing slash", async () => {
		const pi = installPi([
			{ id: "prompt:review", label: "/review", description: "Prompt · Review" },
			{ id: "skill:test", label: "/skill:test", description: "Skill · Test" },
		]);
		const { container } = render(
			<InputBar
				{...baseProps}
				models={[]}
				activeModel={null}
				onModel={vi.fn()}
			/>,
		);
		const textarea = container.querySelector("textarea")!;

		await waitFor(() => expect(pi.listSlashCommands).toHaveBeenCalled());
		fireEvent.change(textarea, { target: { value: "/", selectionStart: 1 } });

		expect(await screen.findByText("/review")).toBeTruthy();
		expect(screen.getByText("/skill:test")).toBeTruthy();
	});

	it("shows an empty-state row instead of silently hiding the popup", async () => {
		const pi = installPi([]);
		const { container } = render(
			<InputBar
				{...baseProps}
				models={[]}
				activeModel={null}
				onModel={vi.fn()}
			/>,
		);
		const textarea = container.querySelector("textarea")!;

		await waitFor(() => expect(pi.listSlashCommands).toHaveBeenCalled());
		fireEvent.change(textarea, { target: { value: "/", selectionStart: 1 } });

		expect(
			await screen.findByText("No skill or prompt commands found"),
		).toBeTruthy();
	});
});

describe("InputBar queued messages", () => {
	it("queues to the parent while streaming instead of sending", () => {
		const onSend = vi.fn();
		const onQueuePending = vi.fn();
		const { container } = render(
			<InputBar
				{...baseProps}
				streaming={true}
				models={[]}
				activeModel={null}
				onModel={vi.fn()}
				onSend={onSend}
				onQueuePending={onQueuePending}
			/>,
		);
		const textarea = container.querySelector("textarea")!;
		fireEvent.change(textarea, { target: { value: "do the thing" } });
		fireEvent.keyDown(textarea, { key: "Enter" });

		expect(onSend).not.toHaveBeenCalled();
		expect(onQueuePending).toHaveBeenCalledWith("do the thing");
	});

	it("pushes and removes queued items via callbacks", () => {
		const onPushPending = vi.fn();
		const onRemovePending = vi.fn();
		const { getByText, getByTitle } = render(
			<InputBar
				{...baseProps}
				streaming={true}
				models={[]}
				activeModel={null}
				onModel={vi.fn()}
				pending={["do the thing"]}
				onPushPending={onPushPending}
				onRemovePending={onRemovePending}
			/>,
		);
		expect(getByText("do the thing")).toBeTruthy();

		fireEvent.click(getByTitle("Steer the agent with this now"));
		expect(onPushPending).toHaveBeenCalledWith(0);

		fireEvent.click(getByTitle("Remove"));
		expect(onRemovePending).toHaveBeenCalledWith(0);
	});
});
