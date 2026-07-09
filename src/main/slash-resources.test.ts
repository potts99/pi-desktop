import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	expandPromptTemplate,
	expandSkillCommand,
	parseCommandArgs,
	substituteArgs,
	type PromptTemplate,
	type Skill,
} from "./slash-resources.ts";

describe("parseCommandArgs", () => {
	it("splits on whitespace and keeps quoted phrases intact", () => {
		expect(parseCommandArgs("foo \"bar baz\" 'qux quux'")).toEqual([
			"foo",
			"bar baz",
			"qux quux",
		]);
	});

	it("returns an empty array for blank input", () => {
		expect(parseCommandArgs("")).toEqual([]);
	});
});

describe("substituteArgs", () => {
	it("substitutes positional args, $@, and $ARGUMENTS", () => {
		expect(substituteArgs("$1 and $2 and $@", ["a", "b"])).toBe(
			"a and b and a b",
		);
		expect(substituteArgs("$ARGUMENTS", ["x", "y"])).toBe("x y");
	});

	it("falls back to a ${N:-default} when the arg is missing", () => {
		expect(substituteArgs("${1:-none}", [])).toBe("none");
		expect(substituteArgs("${1:-none}", ["got"])).toBe("got");
	});

	it("slices with ${@:N:L} and open-ended ${@:N}", () => {
		expect(substituteArgs("${@:2:1}", ["a", "b", "c"])).toBe("b");
		expect(substituteArgs("${@:2}", ["a", "b", "c"])).toBe("b c");
	});

	it("treats ${@:0} as start-from-beginning (captured '0' is a truthy string)", () => {
		expect(substituteArgs("${@:0:2}", ["a", "b", "c"])).toBe("a b");
		expect(substituteArgs("${@:0}", ["a", "b", "c"])).toBe("a b c");
	});

	it("keeps a literal '0' positional arg but substitutes a truly empty one", () => {
		// '0' is a truthy string, so it is kept (matches upstream `value ? value : default`).
		expect(substituteArgs("${1:-d}", ["0"])).toBe("0");
		// An empty quoted arg is null-ish, so the default applies — bash ${:-} semantics.
		expect(substituteArgs("${1:-d}", [""])).toBe("d");
	});
});

function template(name: string, content: string): PromptTemplate {
	return { name, description: "d", content };
}

describe("expandPromptTemplate", () => {
	it("expands a matching /name with its arguments", () => {
		expect(
			expandPromptTemplate("/greet world", [template("greet", "Hello $@")]),
		).toBe("Hello world");
	});

	it("leaves plain text and unknown commands untouched", () => {
		expect(expandPromptTemplate("hello there", [template("greet", "x")])).toBe(
			"hello there",
		);
		expect(expandPromptTemplate("/nope", [template("greet", "x")])).toBe(
			"/nope",
		);
	});
});

describe("expandSkillCommand", () => {
	it("wraps the skill body and appends trailing args", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-skill-"));
		const file = join(dir, "SKILL.md");
		await writeFile(file, "---\nname: demo\n---\nDo the thing.", "utf-8");
		const skill: Skill = {
			name: "demo",
			description: "",
			filePath: file,
			baseDir: dir,
			sourceInfo: {
				path: file,
				source: "test",
				scope: "temporary",
				origin: "top-level",
				baseDir: dir,
			},
			disableModelInvocation: false,
		};

		const out = await expandSkillCommand("/skill:demo fast", [skill]);

		expect(out).toContain('<skill name="demo"');
		expect(out).toContain("Do the thing.");
		expect(out.endsWith("fast")).toBe(true);
	});

	it("ignores non-skill text", async () => {
		expect(await expandSkillCommand("/greet hi", [])).toBe("/greet hi");
	});

	it("passes through when the named skill is not loaded", async () => {
		expect(await expandSkillCommand("/skill:missing", [])).toBe(
			"/skill:missing",
		);
	});
});
