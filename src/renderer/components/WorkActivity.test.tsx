import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TranscriptMessage } from "../../shared/types.ts";
import { deriveWorkActivityItems, WorkActivity } from "./WorkActivity.tsx";

describe("deriveWorkActivityItems", () => {
	it("parses todo tool calls into activity rows", () => {
		const messages: TranscriptMessage[] = [
			{
				role: "user",
				blocks: [{ kind: "text", text: "do it" }],
			},
			{
				role: "assistant",
				blocks: [
					{
						kind: "toolCall",
						id: "t1",
						name: "todo",
						args: { todos: [{ text: "Read files" }, { text: "Patch UI" }] },
					},
				],
			},
		];

		expect(deriveWorkActivityItems(messages, true)).toMatchObject([
			{ label: "Read files", status: "active" },
			{ label: "Patch UI", status: "active" },
		]);
	});

	it("marks question tool results as done", () => {
		const messages: TranscriptMessage[] = [
			{
				role: "assistant",
				blocks: [
					{
						kind: "toolCall",
						id: "q1",
						name: "ask_user_question",
						args: [{ question: "When should the timer start?" }],
					},
				],
			},
			{
				role: "tool",
				blocks: [
					{
						kind: "toolResult",
						toolCallId: "q1",
						toolName: "ask_user_question",
						text: "User selected: Immediately",
						isError: false,
					},
				],
			},
		];

		expect(deriveWorkActivityItems(messages, false)).toMatchObject([
			{
				label: "When should the timer start?",
				detail: "User selected: Immediately",
				status: "done",
			},
		]);
	});

	it("hides pi-lens activity rows", () => {
		const messages: TranscriptMessage[] = [
			{
				role: "assistant",
				blocks: [
					{
						kind: "toolCall",
						id: "t1",
						name: "todo",
						args: { todos: [{ text: "ponytail" }, { text: "pi-lens-lsp" }] },
					},
				],
			},
		];

		expect(deriveWorkActivityItems(messages, true)).toMatchObject([
			{ label: "ponytail", status: "active" },
		]);
	});
});

describe("WorkActivity status items", () => {
	it("hides pi-lens setStatus rows", () => {
		const { container } = render(
			<WorkActivity
				messages={[]}
				active={true}
				uiRequests={[
					{
						id: "s1",
						method: "setStatus",
						statusKey: "pi-lens-lsp",
						statusText: "LSP Active: typescript",
					},
				]}
				onRespond={vi.fn()}
			/>,
		);

		expect(container.textContent).not.toContain("pi-lens-lsp");
		expect(container.textContent).not.toContain("LSP Active");
	});
});

describe("WorkActivity questions", () => {
	it("submits select answers", () => {
		const onRespond = vi.fn().mockResolvedValue(undefined);
		const { getByText } = render(
			<WorkActivity
				messages={[]}
				active={true}
				uiRequests={[
					{
						id: "u1",
						method: "select",
						title: "Pick one",
						options: ["A", "B"],
					},
				]}
				onRespond={onRespond}
			/>,
		);

		fireEvent.click(getByText("B"));

		expect(onRespond).toHaveBeenCalledWith({ id: "u1", value: "B" });
		expect(getByText("Answered · B")).toBeTruthy();
	});

	it("submits input answers", () => {
		const onRespond = vi.fn().mockResolvedValue(undefined);
		const { container, getByTitle } = render(
			<WorkActivity
				messages={[]}
				active={true}
				uiRequests={[
					{
						id: "u2",
						method: "input",
						title: "Name?",
						placeholder: "Type here",
					},
				]}
				onRespond={onRespond}
			/>,
		);

		fireEvent.change(container.querySelector("input")!, {
			target: { value: "Jack" },
		});
		fireEvent.click(getByTitle("Send answer"));

		expect(onRespond).toHaveBeenCalledWith({ id: "u2", value: "Jack" });
	});
});
