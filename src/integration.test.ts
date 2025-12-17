/**
 * Integration Tests for Veil
 *
 * Tests that simulate real-world scenarios and ensure
 * all components work together correctly in production-like conditions
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVeil } from "./veil";
import type { VeilConfig } from "./types";

describe("Integration Tests", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		// Simulate a real production environment
		process.env = {
			...originalEnv,
			// AWS credentials
			AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
			AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
			AWS_REGION: "us-east-1",
			// Database
			DATABASE_URL: "postgresql://admin:supersecret@prod-db.example.com:5432/production",
			REDIS_URL: "redis://:password@redis.example.com:6379",
			// API keys
			CLOUDFLARE_API_TOKEN: "cf_live_token_abc123xyz",
			STRIPE_SECRET_KEY: "sk_live_abc123xyz",
			OPENAI_API_KEY: "sk-proj-abc123xyz",
			// Safe public vars
			NODE_ENV: "production",
			PUBLIC_URL: "https://app.example.com",
			LOG_LEVEL: "info",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("Production Security Scenario", () => {
		const productionConfig: VeilConfig = {
			fileRules: [
				// Block sensitive directories
				{ match: "node_modules", action: "deny", reason: "Too large for context" },
				{ match: ".git", action: "deny", reason: "Version control internal" },
				{ match: /secrets?/, action: "deny", reason: "Contains secrets" },
				{ match: /\.env/, action: "deny", reason: "Environment files" },
				{ match: "private", action: "deny" },
				// Mask certain paths
				{ match: "config/credentials", action: "mask", replacement: "[CREDENTIALS]" },
				// Allow specific overrides
				{ match: "config/public", action: "allow" },
				// Rewrite for synthetic content
				{
					match: ".env.example",
					action: "rewrite",
					replacement: "# Example config\nAPI_KEY=your_key_here",
				},
			],
			envRules: [
				// Mask all AWS credentials
				{ match: /^AWS_/, action: "mask" },
				// Deny database URLs entirely
				{ match: /DATABASE_URL|REDIS_URL/, action: "deny" },
				// Rewrite API keys to safe placeholders
				{ match: "CLOUDFLARE_API_TOKEN", action: "rewrite", replacement: "[CF_TOKEN]" },
				{ match: /STRIPE_|OPENAI_/, action: "rewrite", replacement: "[REDACTED]" },
				// Allow public vars
				{ match: "NODE_ENV", action: "allow" },
				{ match: "PUBLIC_URL", action: "allow" },
			],
			cliRules: [
				// Block dangerous commands
				{
					match: /^rm\s+-rf/,
					action: "deny",
					reason: "Dangerous recursive delete",
					safeAlternatives: ["rm -i", "trash", "mv to-delete/"],
				},
				{ match: /^sudo\s/, action: "deny", reason: "Elevated privileges" },
				{ match: /^chmod\s+777/, action: "deny", reason: "Insecure permissions" },
				// Block credential exposure
				{ match: /curl.*password|wget.*secret/i, action: "deny" },
				// Rewrite docker commands for safety
				{
					match: /^docker\s+run.*--privileged/,
					action: "rewrite",
					replacement: "echo '[privileged docker blocked]'",
				},
				// Allow safe commands explicitly
				{ match: /^ls\s/, action: "allow" },
				{ match: /^cat\s/, action: "allow" },
			],
		};

		it("blocks all sensitive file paths", () => {
			const veil = createVeil(productionConfig);

			// Test various sensitive paths
			const sensitivePaths = [
				"node_modules/react/index.js",
				".git/config",
				"secrets/api-keys.json",
				"secret.txt",
				".env",
				".env.local",
				"private/internal.md",
			];

			for (const path of sensitivePaths) {
				const result = veil.checkFile(path);
				expect(result.ok, `Expected ${path} to be blocked`).toBe(false);
			}
		});

		it("allows safe file paths", () => {
			const veil = createVeil(productionConfig);

			const safePaths = [
				"src/index.ts",
				"package.json",
				"README.md",
				"config/public/settings.json",
			];

			for (const path of safePaths) {
				const result = veil.checkFile(path);
				expect(result.ok, `Expected ${path} to be allowed`).toBe(true);
			}
		});

		it("masks AWS credentials but keeps them visible", () => {
			const veil = createVeil(productionConfig);

			const accessKey = veil.getEnv("AWS_ACCESS_KEY_ID");
			expect(accessKey.ok).toBe(true);
			if (accessKey.ok) {
				expect(accessKey.value).toContain("*");
				expect(accessKey.value).not.toBe("AKIAIOSFODNN7EXAMPLE");
			}

			const secretKey = veil.getEnv("AWS_SECRET_ACCESS_KEY");
			expect(secretKey.ok).toBe(true);
			if (secretKey.ok) {
				expect(secretKey.value).toContain("*");
			}
		});

		it("completely denies database connection strings", () => {
			const veil = createVeil(productionConfig);

			const dbUrl = veil.getEnv("DATABASE_URL");
			expect(dbUrl.ok).toBe(false);
			if (!dbUrl.ok) {
				expect(dbUrl.reason).toBe("env_denied_by_policy");
			}

			const redisUrl = veil.getEnv("REDIS_URL");
			expect(redisUrl.ok).toBe(false);
		});

		it("rewrites API keys to safe placeholders", () => {
			const veil = createVeil(productionConfig);

			const cfToken = veil.getEnv("CLOUDFLARE_API_TOKEN");
			expect(cfToken.ok).toBe(true);
			if (cfToken.ok) {
				expect(cfToken.value).toBe("[CF_TOKEN]");
			}

			const stripeKey = veil.getEnv("STRIPE_SECRET_KEY");
			expect(stripeKey.ok).toBe(true);
			if (stripeKey.ok) {
				expect(stripeKey.value).toBe("[REDACTED]");
			}
		});

		it("allows public environment variables unchanged", () => {
			const veil = createVeil(productionConfig);

			const nodeEnv = veil.getEnv("NODE_ENV");
			expect(nodeEnv.ok).toBe(true);
			if (nodeEnv.ok) {
				expect(nodeEnv.value).toBe("production");
			}

			const publicUrl = veil.getEnv("PUBLIC_URL");
			expect(publicUrl.ok).toBe(true);
			if (publicUrl.ok) {
				expect(publicUrl.value).toBe("https://app.example.com");
			}
		});

		it("blocks dangerous CLI commands with alternatives", () => {
			const veil = createVeil(productionConfig);

			const rmResult = veil.checkCommand("rm -rf /important/data");
			expect(rmResult.ok).toBe(false);
			expect(rmResult.safeAlternatives).toContain("trash");

			const sudoResult = veil.checkCommand("sudo rm file.txt");
			expect(sudoResult.ok).toBe(false);

			const chmodResult = veil.checkCommand("chmod 777 /var/www");
			expect(chmodResult.ok).toBe(false);
		});

		it("rewrites dangerous docker commands", () => {
			const veil = createVeil(productionConfig);

			const result = veil.checkCommand("docker run --privileged -it ubuntu");
			expect(result.ok).toBe(true);
			expect(result.command).toBe("echo '[privileged docker blocked]'");
		});

		it("allows safe commands", () => {
			const veil = createVeil(productionConfig);

			const lsResult = veil.checkCommand("ls -la /home");
			expect(lsResult.ok).toBe(true);
			expect(lsResult.command).toBe("ls -la /home");

			const catResult = veil.checkCommand("cat README.md");
			expect(catResult.ok).toBe(true);
		});

		it("filters a mixed list of paths correctly", () => {
			const veil = createVeil(productionConfig);

			const allPaths = [
				"src/index.ts",
				"node_modules/lodash/index.js",
				"README.md",
				".git/HEAD",
				"package.json",
				"secrets/db.json",
				".env",
				"config/public/app.json",
			];

			const visible = veil.filterPaths(allPaths);
			expect(visible).toEqual([
				"src/index.ts",
				"README.md",
				"package.json",
				"config/public/app.json",
			]);
		});

		it("provides a clean visible environment", () => {
			const veil = createVeil(productionConfig);

			const visibleEnv = veil.getVisibleEnv();

			// Should NOT include denied vars
			expect(visibleEnv.DATABASE_URL).toBeUndefined();
			expect(visibleEnv.REDIS_URL).toBeUndefined();

			// Should include masked vars (with asterisks)
			expect(visibleEnv.AWS_ACCESS_KEY_ID).toContain("*");

			// Should include rewritten vars
			expect(visibleEnv.CLOUDFLARE_API_TOKEN).toBe("[CF_TOKEN]");

			// Should include allowed vars unchanged
			expect(visibleEnv.NODE_ENV).toBe("production");
		});

		it("tracks all blocked operations in audit log", () => {
			const veil = createVeil(productionConfig);

			// Trigger various blocked operations
			veil.checkFile("node_modules/react");
			veil.checkFile("secrets/api.json");
			veil.checkDirectory(".git");
			veil.getEnv("DATABASE_URL");
			veil.checkCommand("rm -rf /");

			const calls = veil.getInterceptedCalls();
			expect(calls.length).toBeGreaterThanOrEqual(5);

			// Verify types are correct
			const fileBlocks = calls.filter((c) => c.type === "file");
			const dirBlocks = calls.filter((c) => c.type === "directory");
			const envBlocks = calls.filter((c) => c.type === "env");
			const cliBlocks = calls.filter((c) => c.type === "cli");

			expect(fileBlocks.length).toBe(2);
			expect(dirBlocks.length).toBe(1);
			expect(envBlocks.length).toBe(1);
			expect(cliBlocks.length).toBe(1);
		});
	});

	describe("Monorepo Context Reduction Scenario", () => {
		it("hides irrelevant packages while exposing the active one", () => {
			const veil = createVeil({
				fileRules: [
					// Hide all packages except the one being worked on
					{ match: "packages/package-a", action: "allow" },
					{ match: /^packages\//, action: "deny" },
					{ match: "node_modules", action: "deny" },
				],
			});

			// Active package is visible
			expect(veil.checkFile("packages/package-a/src/index.ts").ok).toBe(true);

			// Other packages are hidden
			expect(veil.checkFile("packages/package-b/src/index.ts").ok).toBe(false);
			expect(veil.checkFile("packages/package-c/src/index.ts").ok).toBe(false);
		});
	});

	describe("CI/CD Pipeline Scenario", () => {
		it("provides safe context for CI operations", () => {
			const veil = createVeil({
				envRules: [
					{ match: /TOKEN|SECRET|KEY|PASSWORD/i, action: "mask" },
					{ match: "CI", action: "allow" },
					{ match: "GITHUB_", action: "allow" },
				],
				cliRules: [
					{ match: /npm\s+publish/, action: "deny", reason: "Publishing disabled" },
					{
						match: /git\s+push.*--force/,
						action: "deny",
						safeAlternatives: ["git push"],
					},
				],
			});

			// CI vars are visible
			process.env.CI = "true";
			process.env.GITHUB_SHA = "abc123";
			expect(veil.getEnv("CI").ok).toBe(true);

			// Sensitive tokens are masked
			const npmToken = veil.getEnv("CLOUDFLARE_API_TOKEN");
			expect(npmToken.ok).toBe(true);
			if (npmToken.ok) {
				expect(npmToken.value).toContain("*");
			}

			// Dangerous commands are blocked
			expect(veil.checkCommand("npm publish").ok).toBe(false);
			expect(veil.checkCommand("git push --force origin main").ok).toBe(false);
		});
	});

	describe("Scoped Session Scenario", () => {
		it("applies temporary additional restrictions", () => {
			const baseVeil = createVeil({
				fileRules: [{ match: "node_modules", action: "deny" }],
			});

			// Base veil allows src
			expect(baseVeil.checkFile("src/index.ts").ok).toBe(true);
			expect(baseVeil.checkFile("tests/index.test.ts").ok).toBe(true);

			// Create a scoped session that also blocks tests
			const scopedVeil = baseVeil.scope({
				fileRules: [{ match: "tests", action: "deny" }],
			});

			// Scoped veil blocks tests
			expect(scopedVeil.checkFile("src/index.ts").ok).toBe(true);
			expect(scopedVeil.checkFile("tests/index.test.ts").ok).toBe(false);

			// Original veil is unchanged
			expect(baseVeil.checkFile("tests/index.test.ts").ok).toBe(true);
		});
	});

	describe("Context Injection Scenario", () => {
		it("provides synthetic directory structure", () => {
			const veil = createVeil({
				injectors: {
					directories: (path) => {
						if (path === "apps") {
							// Return curated list instead of full 50+ apps
							return ["core-api", "web-client", "admin-portal"];
						}
						return null;
					},
					files: (path) => {
						if (path === "config/database.yml") {
							// Return sanitized config
							return `
database:
  host: localhost
  port: 5432
  name: dev_db
  # credentials managed by environment
`;
						}
						return null;
					},
					env: (key) => {
						if (key === "FEATURE_FLAGS") {
							return '{"newUI": true, "betaFeatures": false}';
						}
						return null;
					},
				},
			});

			// Directory injection
			const dirResult = veil.checkDirectory("apps");
			expect(dirResult.ok).toBe(true);
			if (dirResult.ok && Array.isArray(dirResult.value)) {
				expect(dirResult.value).toEqual(["core-api", "web-client", "admin-portal"]);
			}

			// File injection
			const fileResult = veil.checkFile("config/database.yml");
			expect(fileResult.ok).toBe(true);
			if (fileResult.ok && typeof fileResult.value === "string") {
				expect(fileResult.value).toContain("localhost");
				expect(fileResult.value).not.toContain("password");
			}

			// Env injection
			const envResult = veil.getEnv("FEATURE_FLAGS");
			expect(envResult.ok).toBe(true);
			if (envResult.ok) {
				expect(envResult.value).toContain("newUI");
			}
		});
	});

	describe("Guard Execution Scenario", () => {
		it("executes sync operations in guarded context", async () => {
			const veil = createVeil({});

			const result = await veil.guard(() => {
				return { success: true, data: [1, 2, 3] };
			});

			expect(result.success).toBe(true);
			expect(result.data).toEqual([1, 2, 3]);
		});

		it("executes async operations in guarded context", async () => {
			const veil = createVeil({});

			const result = await veil.guard(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return "async completed";
			});

			expect(result).toBe("async completed");
		});

		it("propagates errors from guarded operations", async () => {
			const veil = createVeil({});

			await expect(
				veil.guard(() => {
					throw new Error("Guarded operation failed");
				})
			).rejects.toThrow("Guarded operation failed");
		});
	});

	describe("VeilContext Export Scenario", () => {
		it("exports complete context state", () => {
			const veil = createVeil({
				envRules: [{ match: /SECRET/, action: "deny" }],
			});

			// Trigger some operations
			veil.checkFile("test.ts");
			veil.getEnv("PUBLIC_URL");

			const context = veil.getContext();

			expect(context.visibleEnv).toBeDefined();
			expect(context.interceptedCalls).toBeInstanceOf(Array);
			expect(context.visibleFiles).toBeInstanceOf(Array);
			expect(context.visibleDirectories).toBeInstanceOf(Array);
		});
	});
});

describe("Edge Cases and Error Handling", () => {
	it("handles empty rules gracefully", () => {
		const veil = createVeil({});

		// Everything should be allowed with no rules
		expect(veil.checkFile("any/path").ok).toBe(true);
		expect(veil.checkDirectory("any/dir").ok).toBe(true);
		expect(veil.checkCommand("any command").ok).toBe(true);
	});

	it("handles undefined replacement in rewrite rules", () => {
		const veil = createVeil({
			fileRules: [{ match: "test", action: "rewrite" }], // No replacement
		});

		const result = veil.checkFile("test.txt");
		// Without replacement, rewrite should block
		expect(result.ok).toBe(false);
	});

	it("handles regex with special characters", () => {
		const veil = createVeil({
			fileRules: [
				{ match: /\.(env|secret)$/, action: "deny" },
				{ match: /node_modules\/.*\/package\.json/, action: "deny" },
			],
		});

		expect(veil.checkFile("config.env").ok).toBe(false);
		expect(veil.checkFile("app.secret").ok).toBe(false);
		expect(veil.checkFile("node_modules/react/package.json").ok).toBe(false);
	});

	it("handles non-existent env variables", () => {
		const veil = createVeil({
			envRules: [{ match: /^NONEXISTENT/, action: "mask" }],
		});

		const result = veil.getEnv("NONEXISTENT_VAR");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toBeUndefined();
		}
	});

	it("handles empty path arrays in filterPaths", () => {
		const veil = createVeil({
			fileRules: [{ match: "test", action: "deny" }],
		});

		expect(veil.filterPaths([])).toEqual([]);
	});

	it("handles commands with various whitespace", () => {
		const veil = createVeil({
			cliRules: [{ match: /rm\s+-rf/, action: "deny" }],
		});

		expect(veil.checkCommand("rm  -rf /").ok).toBe(false);
		expect(veil.checkCommand("rm \t -rf /").ok).toBe(false);
	});
});
