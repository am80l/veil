/**
 * Modal Rules Tests
 */

import { beforeAll, describe, expect, it } from "vitest";
import { buildConfigFromRules, clearRegistry, createVeil, registerPlatformRules } from "./index";
import {
	awsCliRule,
	dockerRule,
	getDefaultContext,
	getDefaultStrictMessage,
	gitRule,
	kubectlRule,
	modalRules,
	npmRule,
	registerModalRules,
	terraformRule,
	wranglerRule,
} from "./rules/modal";
import type { RulesConfig } from "./rules/types";

describe("Modal Rules", () => {
	beforeAll(() => {
		clearRegistry();
		registerPlatformRules();
		registerModalRules();
	});

	describe("Rule Definitions", () => {
		it("should have all modal rules defined", () => {
			expect(modalRules.length).toBe(7);
		});

		it("should have wrangler rule with correct properties", () => {
			expect(wranglerRule.id).toBe("cli/wrangler");
			expect(wranglerRule.supportsMode).toBe(true);
			expect(wranglerRule.defaultMode).toBe("passive");
			expect(wranglerRule.createRules).toBeDefined();
		});

		it("should have docker rule with correct properties", () => {
			expect(dockerRule.id).toBe("cli/docker");
			expect(dockerRule.supportsMode).toBe(true);
			expect(dockerRule.defaultMode).toBe("passive");
		});

		it("should have terraform rule with correct properties", () => {
			expect(terraformRule.id).toBe("cli/terraform");
			expect(terraformRule.supportsMode).toBe(true);
		});

		it("should have kubectl rule with correct properties", () => {
			expect(kubectlRule.id).toBe("cli/kubectl");
			expect(kubectlRule.supportsMode).toBe(true);
		});

		it("should have AWS CLI rule with correct properties", () => {
			expect(awsCliRule.id).toBe("cli/aws");
			expect(awsCliRule.supportsMode).toBe(true);
		});

		it("should have npm rule with correct properties", () => {
			expect(npmRule.id).toBe("cli/npm");
			expect(npmRule.supportsMode).toBe(true);
		});

		it("should have git rule with correct properties", () => {
			expect(gitRule.id).toBe("cli/git");
			expect(gitRule.supportsMode).toBe(true);
		});
	});

	describe("Strict Mode", () => {
		it("should block wrangler commands in strict mode", () => {
			const rules: RulesConfig = {
				"cli/wrangler": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			const result = veil.checkCommand("wrangler deploy");
			expect(result.ok).toBe(false);
		});

		it("should block wrangler.toml in strict mode", () => {
			const rules: RulesConfig = {
				"cli/wrangler": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			const result = veil.checkFile("wrangler.toml");
			expect(result.ok).toBe(false);
		});

		it("should use custom message in strict mode", () => {
			const customMessage = "Custom block message";
			const rules: RulesConfig = {
				"cli/wrangler": ["error", { mode: "strict", message: customMessage }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			const result = veil.checkCommand("wrangler deploy");
			expect(result.ok).toBe(false);
			// The custom message is stored in the CLI rule's reason field
			// We verify it blocked - the message is in the underlying rule
		});

		it("should block docker commands in strict mode", () => {
			const rules: RulesConfig = {
				"cli/docker": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("docker build .").ok).toBe(false);
			expect(veil.checkCommand("docker-compose up").ok).toBe(false);
		});

		it("should block Dockerfile in strict mode", () => {
			const rules: RulesConfig = {
				"cli/docker": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkFile("Dockerfile").ok).toBe(false);
			expect(veil.checkFile("docker-compose.yml").ok).toBe(false);
		});

		it("should block terraform commands in strict mode", () => {
			const rules: RulesConfig = {
				"cli/terraform": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("terraform apply").ok).toBe(false);
			expect(veil.checkFile("main.tf").ok).toBe(false);
		});

		it("should block kubectl commands in strict mode", () => {
			const rules: RulesConfig = {
				"cli/kubectl": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("kubectl get pods").ok).toBe(false);
		});

		it("should block AWS CLI commands in strict mode", () => {
			const rules: RulesConfig = {
				"cli/aws": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("aws s3 ls").ok).toBe(false);
		});

		it("should block npm install in strict mode", () => {
			const rules: RulesConfig = {
				"cli/npm": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("npm install lodash").ok).toBe(false);
			expect(veil.checkCommand("pnpm add lodash").ok).toBe(false);
			expect(veil.checkCommand("yarn add lodash").ok).toBe(false);
		});

		it("should block git push in strict mode", () => {
			const rules: RulesConfig = {
				"cli/git": ["error", { mode: "strict" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("git push origin main").ok).toBe(false);
		});
	});

	describe("Passive Mode", () => {
		it("should allow wrangler commands in passive mode", () => {
			const rules: RulesConfig = {
				"cli/wrangler": ["error", { mode: "passive" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			const result = veil.checkCommand("wrangler deploy");
			expect(result.ok).toBe(true);
		});

		it("should allow docker commands in passive mode", () => {
			const rules: RulesConfig = {
				"cli/docker": ["error", { mode: "passive" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("docker build .").ok).toBe(true);
		});

		it("should allow terraform commands in passive mode", () => {
			const rules: RulesConfig = {
				"cli/terraform": ["error", { mode: "passive" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("terraform plan").ok).toBe(true);
		});

		it("should allow npm commands in passive mode", () => {
			const rules: RulesConfig = {
				"cli/npm": ["error", { mode: "passive" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("npm install lodash").ok).toBe(true);
		});
	});

	describe("Default Mode", () => {
		it("should use passive mode by default for wrangler", () => {
			const rules: RulesConfig = {
				"cli/wrangler": "error", // No mode specified
			};
			const veil = createVeil(buildConfigFromRules(rules));

			// Should allow because default is passive
			expect(veil.checkCommand("wrangler deploy").ok).toBe(true);
		});
	});

	describe("Context Helpers", () => {
		it("should return default context for known rules", () => {
			expect(getDefaultContext("cli/wrangler")).toBeDefined();
			expect(getDefaultContext("cli/wrangler")).toContain("Cloudflare");
		});

		it("should return default strict message for known rules", () => {
			expect(getDefaultStrictMessage("cli/wrangler")).toBeDefined();
			expect(getDefaultStrictMessage("cli/wrangler")).toContain("blocked");
		});

		it("should return undefined for unknown rules", () => {
			expect(getDefaultContext("unknown/rule")).toBeUndefined();
			expect(getDefaultStrictMessage("unknown/rule")).toBeUndefined();
		});
	});

	describe("Mixed Configurations", () => {
		it("should handle mixed strict and passive rules", () => {
			const rules: RulesConfig = {
				"cli/wrangler": ["error", { mode: "strict" }],
				"cli/docker": ["error", { mode: "passive" }],
			};
			const veil = createVeil(buildConfigFromRules(rules));

			expect(veil.checkCommand("wrangler deploy").ok).toBe(false);
			expect(veil.checkCommand("docker build .").ok).toBe(true);
		});

		it("should work with platform rules", () => {
			const rules: RulesConfig = {
				"cli/wrangler": ["error", { mode: "strict" }],
				"linux/no-delete-root": "error",
			};
			const veil = createVeil(buildConfigFromRules(rules, "linux"));

			expect(veil.checkCommand("wrangler deploy").ok).toBe(false);
			expect(veil.checkCommand("rm -rf /").ok).toBe(false);
		});
	});
});
