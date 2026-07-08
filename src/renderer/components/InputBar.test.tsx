import { fireEvent, render } from "@testing-library/react";
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
