import { describe, expect, it } from "vitest";
import { applyMask, evaluateRules, findMatchingRule, generatePolicyRef, matchesPattern } from "./matching";
import type { CliRule, FileRule } from "./types";

describe("matching", () => {
	describe("matchesPattern", () => {
		it("matches exact strings", () => {
			expect(matchesPattern("node_modules", "node_modules")).toBe(true);
			expect(matchesPattern("src/index.ts", "src/index.ts")).toBe(true);
		});

		it("matches string contains", () => {
			expect(matchesPattern("/path/to/secrets/config.json", "secrets")).toBe(true);
			expect(matchesPattern("/home/user/node_modules/package", "node_modules")).toBe(true);
		});

		it("does not match non-matching strings", () => {
			expect(matchesPattern("src/index.ts", "node_modules")).toBe(false);
		});

		it("matches regex patterns", () => {
			expect(matchesPattern("AWS_SECRET_KEY", /^AWS_/)).toBe(true);
			expect(matchesPattern("secrets/api.json", /secrets/)).toBe(true);
		});

		it("does not match non-matching regex", () => {
			expect(matchesPattern("CLOUDFLARE_TOKEN", /^AWS_/)).toBe(false);
		});
	});

	describe("findMatchingRule", () => {
		const rules: FileRule[] = [
			{ match: "node_modules", action: "deny" },
			{ match: /secrets/, action: "deny" },
			{ match: "src", action: "allow" },
		];

		it("finds the first matching rule", () => {
			const result = findMatchingRule("node_modules/package", rules);
			expect(result).not.toBeNull();
			expect(result?.index).toBe(0);
			expect(result?.rule.action).toBe("deny");
		});

		it("finds regex matches", () => {
			const result = findMatchingRule("/path/to/secrets/file.txt", rules);
			expect(result).not.toBeNull();
			expect(result?.index).toBe(1);
		});

		it("returns null for no match", () => {
			const result = findMatchingRule("/some/other/path", rules);
			expect(result).toBeNull();
		});

		it("returns null for empty rules array", () => {
			const result = findMatchingRule("any/path", []);
			expect(result).toBeNull();
		});
	});

	describe("evaluateRules", () => {
		const fileRules: FileRule[] = [
			{ match: "node_modules", action: "deny", reason: "Too large" },
			{ match: /\.env/, action: "mask" },
		];

		const cliRules: CliRule[] = [
			{ match: /^rm -rf/, action: "deny", safeAlternatives: ["trash"] },
		];

		it("returns action and policy reference for matching rules", () => {
			const result = evaluateRules("node_modules/react", fileRules);
			expect(result).not.toBeNull();
			expect(result?.action).toBe("deny");
			expect(result?.policyRef).toBe("rules[0]");
		});

		it("returns null for non-matching paths", () => {
			const result = evaluateRules("src/index.ts", fileRules);
			expect(result).toBeNull();
		});

		it("identifies cliRules by safeAlternatives property", () => {
			const result = evaluateRules("rm -rf /", cliRules);
			expect(result).not.toBeNull();
			expect(result?.policyRef).toBe("cliRules[0]");
		});

		it("returns null for empty rules", () => {
			const result = evaluateRules("any/path", []);
			expect(result).toBeNull();
		});
	});

	describe("applyMask", () => {
		it("uses replacement if provided", () => {
			expect(applyMask("secret_value", "***MASKED***")).toBe("***MASKED***");
		});

		it("masks short values completely", () => {
			expect(applyMask("abc")).toBe("****");
			expect(applyMask("a")).toBe("****");
			expect(applyMask("ab")).toBe("****");
			expect(applyMask("abcd")).toBe("****");
		});

		it("masks middle of longer values", () => {
			const masked = applyMask("my_secret_key_12345");
			expect(masked.startsWith("m")).toBe(true);
			expect(masked.endsWith("5")).toBe(true);
			expect(masked).toContain("*");
		});

		it("limits asterisks to 8 for very long strings", () => {
			const masked = applyMask("this_is_a_very_long_secret_key_that_should_be_masked");
			// Should have first char + 8 asterisks + last char
			expect(masked.length).toBe(10);
		});
	});

	describe("generatePolicyRef", () => {
		it("generates correct policy reference string", () => {
			expect(generatePolicyRef("fileRules", 0)).toBe("fileRules[0]");
			expect(generatePolicyRef("envRules", 5)).toBe("envRules[5]");
			expect(generatePolicyRef("cliRules", 10)).toBe("cliRules[10]");
		});
	});
});
