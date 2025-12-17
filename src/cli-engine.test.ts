import { describe, expect, it } from "vitest";
import { createCliEngine } from "./cli-engine";
import type { CliRule } from "./types";

describe("cli-engine", () => {
	describe("checkCommand", () => {
		const rules: CliRule[] = [
			{
				match: /^rm -rf/,
				action: "deny",
				reason: "Dangerous command",
				safeAlternatives: ["rm -i", "trash"],
			},
			{
				match: /^docker build/,
				action: "rewrite",
				replacement: "echo '[docker build blocked]'",
			},
			{ match: "ls", action: "allow" },
			{ match: /^curl.*password/, action: "deny", reason: "Potential credential leak" },
			{ match: /^masked-cmd/, action: "mask", safeAlternatives: ["safe-cmd"] },
			{ match: /^rewrite-no-replacement/, action: "rewrite" },
		];

		const engine = createCliEngine(rules);

		it("allows commands not matching any rule", () => {
			const result = engine.checkCommand("cat file.txt");
			expect(result.ok).toBe(true);
			expect(result.command).toBe("cat file.txt");
		});

		it("allows explicitly allowed commands", () => {
			const result = engine.checkCommand("ls -la");
			expect(result.ok).toBe(true);
		});

		it("blocks dangerous commands", () => {
			const result = engine.checkCommand("rm -rf /");
			expect(result.ok).toBe(false);
			expect(result.blocked).toBe(true);
			expect(result.reason).toBe("command_denied_by_policy");
			expect(result.safeAlternatives).toEqual(["rm -i", "trash"]);
		});

		it("rewrites commands matching rewrite rules", () => {
			const result = engine.checkCommand("docker build -t myapp .");
			expect(result.ok).toBe(true);
			expect(result.command).toBe("echo '[docker build blocked]'");
		});

		it("blocks commands with potential credential leaks", () => {
			const result = engine.checkCommand("curl https://api.example.com?password=secret");
			expect(result.ok).toBe(false);
		});

		it("treats mask action as deny for CLI", () => {
			const result = engine.checkCommand("masked-cmd arg1");
			expect(result.ok).toBe(false);
			expect(result.blocked).toBe(true);
			expect(result.reason).toBe("command_denied_by_policy");
			expect(result.safeAlternatives).toEqual(["safe-cmd"]);
		});

		it("returns original command when rewrite has no replacement", () => {
			const result = engine.checkCommand("rewrite-no-replacement test");
			expect(result.ok).toBe(true);
			expect(result.command).toBe("rewrite-no-replacement test");
		});
	});

	describe("isAllowed", () => {
		const rules: CliRule[] = [{ match: /^rm -rf/, action: "deny" }];

		const engine = createCliEngine(rules);

		it("returns true for allowed commands", () => {
			expect(engine.isAllowed("ls -la")).toBe(true);
		});

		it("returns false for denied commands", () => {
			expect(engine.isAllowed("rm -rf /")).toBe(false);
		});
	});

	describe("transform", () => {
		const rules: CliRule[] = [
			{ match: /^docker build/, action: "rewrite", replacement: "echo 'blocked'" },
			{ match: /^rm -rf/, action: "deny" },
		];

		const engine = createCliEngine(rules);

		it("transforms rewritable commands", () => {
			expect(engine.transform("docker build .")).toBe("echo 'blocked'");
		});

		it("returns null for denied commands", () => {
			expect(engine.transform("rm -rf /")).toBeNull();
		});

		it("returns original command for allowed commands", () => {
			expect(engine.transform("ls -la")).toBe("ls -la");
		});
	});
});
