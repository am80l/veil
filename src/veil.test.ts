import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVeil } from "./veil";

describe("veil", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = {
			...originalEnv,
			AWS_SECRET_KEY: "super_secret_key",
			PUBLIC_URL: "https://example.com",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("createVeil", () => {
		it("creates a veil instance with default config", () => {
			const veil = createVeil();
			expect(veil).toBeDefined();
			expect(veil.checkFile).toBeTypeOf("function");
			expect(veil.getEnv).toBeTypeOf("function");
			expect(veil.checkCommand).toBeTypeOf("function");
		});

		it("creates a veil instance with custom rules", () => {
			const veil = createVeil({
				fileRules: [{ match: "node_modules", action: "deny" }],
				envRules: [{ match: /^AWS_/, action: "mask" }],
				cliRules: [{ match: /^rm -rf/, action: "deny" }],
			});
			expect(veil).toBeDefined();
		});
	});

	describe("checkFile", () => {
		it("blocks files according to rules", () => {
			const veil = createVeil({
				fileRules: [{ match: "node_modules", action: "deny" }],
			});

			const result = veil.checkFile("node_modules/react/index.js");
			expect(result.ok).toBe(false);
		});

		it("allows files not matching rules", () => {
			const veil = createVeil({
				fileRules: [{ match: "node_modules", action: "deny" }],
			});

			const result = veil.checkFile("src/index.ts");
			expect(result.ok).toBe(true);
		});
	});

	describe("getEnv", () => {
		it("masks env vars according to rules", () => {
			const veil = createVeil({
				envRules: [{ match: /^AWS_/, action: "mask" }],
			});

			const result = veil.getEnv("AWS_SECRET_KEY");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toContain("*");
				expect(result.value).not.toBe("super_secret_key");
			}
		});

		it("allows env vars not matching rules", () => {
			const veil = createVeil({
				envRules: [{ match: /^AWS_/, action: "mask" }],
			});

			const result = veil.getEnv("PUBLIC_URL");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("https://example.com");
			}
		});
	});

	describe("checkCommand", () => {
		it("blocks dangerous commands", () => {
			const veil = createVeil({
				cliRules: [{ match: /^rm -rf/, action: "deny", safeAlternatives: ["rm -i"] }],
			});

			const result = veil.checkCommand("rm -rf /");
			expect(result.ok).toBe(false);
			expect(result.safeAlternatives).toEqual(["rm -i"]);
		});
	});

	describe("filterPaths", () => {
		it("filters out blocked paths", () => {
			const veil = createVeil({
				fileRules: [
					{ match: "node_modules", action: "deny" },
					{ match: /\.git/, action: "deny" },
				],
			});

			const paths = ["src/index.ts", "node_modules/react", ".git/config", "README.md"];
			const filtered = veil.filterPaths(paths);

			expect(filtered).toEqual(["src/index.ts", "README.md"]);
		});
	});

	describe("scope", () => {
		it("creates a scoped instance with merged rules", () => {
			const veil = createVeil({
				fileRules: [{ match: "node_modules", action: "deny" }],
			});

			const scoped = veil.scope({
				fileRules: [{ match: "dist", action: "deny" }],
			});

			// Original still allows dist
			expect(veil.checkFile("dist/index.js").ok).toBe(true);

			// Scoped blocks both
			expect(scoped.checkFile("node_modules/react").ok).toBe(false);
			expect(scoped.checkFile("dist/index.js").ok).toBe(false);
		});
	});

	describe("getInterceptedCalls", () => {
		it("logs intercepted calls", () => {
			const veil = createVeil({
				fileRules: [{ match: "secrets", action: "deny" }],
			});

			veil.checkFile("secrets/api.json");
			veil.checkFile("secrets/db.json");

			const calls = veil.getInterceptedCalls();
			expect(calls).toHaveLength(2);
			expect(calls[0]?.type).toBe("file");
			expect(calls[0]?.target).toBe("secrets/api.json");
		});

		it("clears intercepted calls", () => {
			const veil = createVeil({
				fileRules: [{ match: "secrets", action: "deny" }],
			});

			veil.checkFile("secrets/api.json");
			expect(veil.getInterceptedCalls()).toHaveLength(1);

			veil.clearInterceptedCalls();
			expect(veil.getInterceptedCalls()).toHaveLength(0);
		});
	});

	describe("getContext", () => {
		it("returns the current veil context", () => {
			const veil = createVeil({
				envRules: [{ match: /^AWS_/, action: "deny" }],
			});

			const context = veil.getContext();
			expect(context.visibleEnv).toBeDefined();
			expect(context.visibleEnv.PUBLIC_URL).toBe("https://example.com");
			expect(context.visibleEnv.AWS_SECRET_KEY).toBeUndefined();
		});
	});

	describe("guard", () => {
		it("executes operations in guarded context", async () => {
			const veil = createVeil();

			const result = await veil.guard(() => {
				return "guarded result";
			});

			expect(result).toBe("guarded result");
		});

		it("handles async operations", async () => {
			const veil = createVeil();

			const result = await veil.guard(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return "async result";
			});

			expect(result).toBe("async result");
		});

		it("returns detailed result with intercepts when detailed option is true", async () => {
			const veil = createVeil({
				fileRules: [{ match: "secret", action: "deny" }],
			});

			const result = await veil.guard(
				() => {
					veil.checkFile("/path/to/secret.txt");
					return "operation complete";
				},
				{ detailed: true },
			);

			expect(result.value).toBe("operation complete");
			expect(result.success).toBe(true);
			expect(result.duration).toBeGreaterThanOrEqual(0);
			expect(result.intercepts).toHaveLength(1);
			expect(result.intercepts[0].type).toBe("file");
			expect(result.intercepts[0].target).toBe("/path/to/secret.txt");
		});

		it("captures errors in detailed mode", async () => {
			const veil = createVeil();

			const result = await veil.guard(
				() => {
					throw new Error("Test error");
				},
				{ detailed: true },
			);

			expect(result.success).toBe(false);
			expect(result.error?.message).toBe("Test error");
		});

		it("propagates errors in simple mode", async () => {
			const veil = createVeil();

			await expect(
				veil.guard(() => {
					throw new Error("Should propagate");
				}),
			).rejects.toThrow("Should propagate");
		});
	});
});
