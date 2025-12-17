import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEnvEngine } from "./env-engine";
import type { EnvRule } from "./types";

describe("env-engine", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		// Setup test environment variables
		process.env = {
			...originalEnv,
			AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
			AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			DATABASE_URL: "postgresql://user:password@localhost:5432/db",
			PUBLIC_API_URL: "https://api.example.com",
			CLOUDFLARE_API_TOKEN: "cf_token_12345",
			ALLOWED_VAR: "allowed_value",
			REWRITE_VAR: "original_value",
			REWRITE_NO_REPLACEMENT: "should_be_empty",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("getEnv", () => {
		const rules: EnvRule[] = [
			{ match: /^AWS_/, action: "mask" },
			{ match: "DATABASE_URL", action: "deny" },
			{ match: "CLOUDFLARE_API_TOKEN", action: "rewrite", replacement: "[REDACTED]" },
			{ match: "ALLOWED_VAR", action: "allow" },
			{ match: "REWRITE_NO_REPLACEMENT", action: "rewrite" },
		];

		const engine = createEnvEngine(rules);

		it("allows access to non-matching variables", () => {
			const result = engine.getEnv("PUBLIC_API_URL");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("https://api.example.com");
			}
		});

		it("masks variables matching mask rules", () => {
			const result = engine.getEnv("AWS_ACCESS_KEY_ID");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).not.toBe("AKIAIOSFODNN7EXAMPLE");
				expect(result.value).toContain("*");
			}
		});

		it("blocks access to denied variables", () => {
			const result = engine.getEnv("DATABASE_URL");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.blocked).toBe(true);
				expect(result.reason).toBe("env_denied_by_policy");
			}
		});

		it("returns replacement for rewritten variables", () => {
			const result = engine.getEnv("CLOUDFLARE_API_TOKEN");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("[REDACTED]");
			}
		});

		it("returns undefined for non-existent variables", () => {
			const result = engine.getEnv("NONEXISTENT_VAR");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeUndefined();
			}
		});

		it("allows explicitly allowed variables", () => {
			const result = engine.getEnv("ALLOWED_VAR");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("allowed_value");
			}
		});

		it("returns empty string for rewrite without replacement", () => {
			const result = engine.getEnv("REWRITE_NO_REPLACEMENT");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("");
			}
		});

		it("returns undefined when masking non-existent variable", () => {
			const maskRules: EnvRule[] = [{ match: /^MISSING_/, action: "mask" }];
			const eng = createEnvEngine(maskRules);

			const result = eng.getEnv("MISSING_VAR");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBeUndefined();
			}
		});
	});

	describe("getVisibleEnv", () => {
		const rules: EnvRule[] = [
			{ match: /^AWS_/, action: "mask" },
			{ match: "DATABASE_URL", action: "deny" },
			{ match: "CLOUDFLARE_API_TOKEN", action: "rewrite", replacement: "[REDACTED]" },
			{ match: "ALLOWED_VAR", action: "allow" },
			{ match: "REWRITE_NO_REPLACEMENT", action: "rewrite" },
		];

		const engine = createEnvEngine(rules);

		it("returns all visible env vars with transformations applied", () => {
			const visible = engine.getVisibleEnv();

			// Allowed through
			expect(visible.PUBLIC_API_URL).toBe("https://api.example.com");

			// Masked
			expect(visible.AWS_ACCESS_KEY_ID).toContain("*");
			expect(visible.AWS_ACCESS_KEY_ID).not.toBe("AKIAIOSFODNN7EXAMPLE");

			// Rewritten
			expect(visible.CLOUDFLARE_API_TOKEN).toBe("[REDACTED]");

			// Denied - should not be present
			expect(visible.DATABASE_URL).toBeUndefined();

			// Explicitly allowed
			expect(visible.ALLOWED_VAR).toBe("allowed_value");

			// Rewrite without replacement
			expect(visible.REWRITE_NO_REPLACEMENT).toBe("");
		});
	});

	describe("isVisible", () => {
		const rules: EnvRule[] = [
			{ match: "DENIED_VAR", action: "deny" },
			{ match: "MASKED_VAR", action: "mask" },
			{ match: "ALLOWED_VAR", action: "allow" },
		];

		const engine = createEnvEngine(rules);

		it("returns true for non-matching keys", () => {
			expect(engine.isVisible("SOME_OTHER_VAR")).toBe(true);
		});

		it("returns false for denied keys", () => {
			expect(engine.isVisible("DENIED_VAR")).toBe(false);
		});

		it("returns true for masked keys (they are visible but transformed)", () => {
			expect(engine.isVisible("MASKED_VAR")).toBe(true);
		});

		it("returns true for allowed keys", () => {
			expect(engine.isVisible("ALLOWED_VAR")).toBe(true);
		});
	});

	describe("with injectors", () => {
		it("uses injected env values", () => {
			const engine = createEnvEngine([], {
				env: (key) => {
					if (key === "INJECTED_VAR") {
						return "injected_value";
					}
					return null;
				},
			});

			const result = engine.getEnv("INJECTED_VAR");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("injected_value");
			}
		});

		it("falls back to rules when injector returns null", () => {
			const engine = createEnvEngine([{ match: "DATABASE_URL", action: "deny" }], {
				env: () => null,
			});

			const result = engine.getEnv("DATABASE_URL");
			expect(result.ok).toBe(false);
		});
	});
});
