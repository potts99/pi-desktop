import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testHome = "";

describe("advisor-store", () => {
	beforeEach(async () => {
		testHome = await mkdtemp("/tmp/pi-desktop-advisor-");
		vi.resetModules();
		vi.stubEnv("HOME", testHome);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await rm(testHome, { recursive: true, force: true });
	});

	it("saves and normalizes advisor config", async () => {
		const { getAdvisorConfig, updateAdvisorConfig } = await import(
			"./advisor-store.ts"
		);

		await expect(getAdvisorConfig()).resolves.toMatchObject({
			enabled: false,
			model: null,
		});

		const savedConfig = await updateAdvisorConfig({
			enabled: true,
			model: { provider: "openai", id: "gpt-5" },
			thinkingLevel: "high",
			instructions: "watch tests",
			maxConsecutive: 0,
		});

		expect(savedConfig).toEqual({
			enabled: true,
			model: { provider: "openai", id: "gpt-5" },
			thinkingLevel: "high",
			instructions: "watch tests",
			maxConsecutive: 1,
		});
		await expect(getAdvisorConfig()).resolves.toEqual(savedConfig);
		await expect(
			readFile(join(testHome, ".pi/agent/pi-desktop-advisor.json"), "utf-8"),
		).resolves.toContain("gpt-5");
	});
});
