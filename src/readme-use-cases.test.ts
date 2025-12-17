/**
 * README Use Case Tests
 *
 * Tests for the 4 real-world examples documented in the README:
 * 1. Block commands with helpful context (wrangler deploy)
 * 2. Allow env vars with sensitivity context (CLOUDFLARE_API_TOKEN)
 * 3. Allow CLI with corrective guidance (wrangler kv without --remote)
 * 4. Block dangerous commands completely (rm -rf, git reset --hard)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCliEngine } from "./cli-engine";
import { createEnvEngine } from "./env-engine";
import type { CliRule, EnvRule } from "./types";
import { createVeil } from "./veil";

describe("README Use Cases", () => {
	describe("Use Case 1: Block wrangler deploy with helpful context", () => {
		it("blocks wrangler deploy with custom reason", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^wrangler\s+(deploy|publish)/,
						action: "deny",
						reason: "Use npm run build:stage instead",
						safeAlternatives: ["npm run build:stage", "npx appkit deploy:stage"],
					},
				],
			});

			const result = veil.checkCommand("wrangler deploy");

			expect(result.ok).toBe(false);
			expect(result.reason).toBe("Use npm run build:stage instead");
			expect(result.safeAlternatives).toContain("npm run build:stage");
			expect(result.safeAlternatives).toContain("npx appkit deploy:stage");
		});

		it("blocks wrangler publish with same rules", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^wrangler\s+(deploy|publish)/,
						action: "deny",
						reason: "Direct deployment disabled",
					},
				],
			});

			const result = veil.checkCommand("wrangler publish --env production");

			expect(result.ok).toBe(false);
			expect(result.reason).toBe("Direct deployment disabled");
		});

		it("allows other wrangler commands", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^wrangler\s+(deploy|publish)/,
						action: "deny",
					},
				],
			});

			expect(veil.checkCommand("wrangler dev").ok).toBe(true);
			expect(veil.checkCommand("wrangler whoami").ok).toBe(true);
			expect(veil.checkCommand("wrangler kv:key list").ok).toBe(true);
		});
	});

	describe("Use Case 2: Allow env var with sensitivity context", () => {
		const originalEnv = process.env;

		beforeEach(() => {
			process.env = {
				...originalEnv,
				CLOUDFLARE_API_TOKEN: "cf_live_abc123xyz",
			};
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		it("allows access but returns context field", () => {
			const veil = createVeil({
				envRules: [
					{
						match: "CLOUDFLARE_API_TOKEN",
						action: "allow",
						reason: "SENSITIVE: Handle with care",
					},
				],
			});

			const result = veil.getEnv("CLOUDFLARE_API_TOKEN");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("cf_live_abc123xyz");
				expect(result.context).toBe("SENSITIVE: Handle with care");
			}
		});

		it("env engine returns context on allow with reason", () => {
			const rules: EnvRule[] = [
				{
					match: "CLOUDFLARE_API_TOKEN",
					action: "allow",
					reason: "This is a sensitive API token",
				},
			];

			const engine = createEnvEngine(rules);
			const result = engine.getEnv("CLOUDFLARE_API_TOKEN");

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("cf_live_abc123xyz");
				expect(result.context).toBe("This is a sensitive API token");
			}
		});

		it("does not set context when no reason provided", () => {
			const veil = createVeil({
				envRules: [
					{
						match: "CLOUDFLARE_API_TOKEN",
						action: "allow",
					},
				],
			});

			const result = veil.getEnv("CLOUDFLARE_API_TOKEN");

			expect(result.ok).toBe(true);
			expect(result.context).toBeUndefined();
		});
	});

	describe("Use Case 3: Allow CLI with corrective guidance", () => {
		it("allows command but returns context with guidance", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^wrangler\s+kv:key\s+(get|list|put|delete)(?!.*--remote)/,
						action: "allow",
						reason: "WARNING: Use --remote flag for production data",
					},
				],
			});

			const result = veil.checkCommand('wrangler kv:key get "config" --binding SETTINGS');

			expect(result.ok).toBe(true);
			expect(result.command).toBe('wrangler kv:key get "config" --binding SETTINGS');
			expect(result.context).toBe("WARNING: Use --remote flag for production data");
		});

		it("does not trigger when --remote is present", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^wrangler\s+kv:key\s+(get|list|put|delete)(?!.*--remote)/,
						action: "allow",
						reason: "Use --remote for production",
					},
				],
			});

			const result = veil.checkCommand("wrangler kv:key get config --binding SETTINGS --remote");

			expect(result.ok).toBe(true);
			// No rule matched, so no context
			expect(result.context).toBeUndefined();
		});

		it("cli engine returns context on allow with reason", () => {
			const rules: CliRule[] = [
				{
					match: /^wrangler\s+kv/,
					action: "allow",
					reason: "KV access allowed with caution",
				},
			];

			const engine = createCliEngine(rules);
			const result = engine.checkCommand("wrangler kv:key list");

			expect(result.ok).toBe(true);
			expect(result.context).toBe("KV access allowed with caution");
		});
	});

	describe("Use Case 4: Block dangerous commands completely", () => {
		it("blocks rm -rf with root target", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^rm\s+(-rf|-fr)\s+(\/|~|\$HOME)/,
						action: "deny",
						reason: "BLOCKED: Dangerous recursive delete",
						safeAlternatives: ["rm -i", "trash-cli"],
					},
				],
			});

			const result = veil.checkCommand("rm -rf /");

			expect(result.ok).toBe(false);
			expect(result.reason).toBe("BLOCKED: Dangerous recursive delete");
			expect(result.safeAlternatives).toContain("trash-cli");
		});

		it("blocks rm -rf with home directory target", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^rm\s+(-rf|-fr)\s+(\/|~|\$HOME)/,
						action: "deny",
						reason: "BLOCKED: Dangerous recursive delete",
					},
				],
			});

			expect(veil.checkCommand("rm -rf ~").ok).toBe(false);
			expect(veil.checkCommand("rm -fr ~/").ok).toBe(false);
		});

		it("blocks git reset --hard", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^git\s+reset\s+--hard/,
						action: "deny",
						reason: "BLOCKED: Discards uncommitted changes",
						safeAlternatives: ["git stash", "git reset --soft"],
					},
				],
			});

			const result = veil.checkCommand("git reset --hard");

			expect(result.ok).toBe(false);
			expect(result.reason).toBe("BLOCKED: Discards uncommitted changes");
			expect(result.safeAlternatives).toContain("git stash");
		});

		it("blocks git push --force but allows --force-with-lease", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^git\s+push\s+--force(?!\s*-with-lease)/,
						action: "deny",
						reason: "BLOCKED: Use --force-with-lease instead",
						safeAlternatives: ["git push --force-with-lease"],
					},
				],
			});

			expect(veil.checkCommand("git push --force").ok).toBe(false);
			expect(veil.checkCommand("git push --force origin main").ok).toBe(false);
			// --force-with-lease should be allowed (negative lookahead)
			expect(veil.checkCommand("git push --force-with-lease").ok).toBe(true);
		});

		it("blocks git clean with force and directory flags", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^git\s+clean\s+-[dxfin]*f[dxfin]*\s*/,
						action: "deny",
						reason: "BLOCKED: Deletes untracked files permanently",
					},
				],
			});

			expect(veil.checkCommand("git clean -fd").ok).toBe(false);
			expect(veil.checkCommand("git clean -f").ok).toBe(false);
			expect(veil.checkCommand("git clean -xfd").ok).toBe(false);
		});

		it("blocks DROP DATABASE/TABLE commands", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /DROP\s+(DATABASE|TABLE|SCHEMA)/i,
						action: "deny",
						reason: "BLOCKED: Database DROP not allowed via LLM",
					},
				],
			});

			expect(veil.checkCommand("DROP DATABASE production").ok).toBe(false);
			expect(veil.checkCommand("drop table users").ok).toBe(false);
			expect(veil.checkCommand("DROP SCHEMA public").ok).toBe(false);
		});
	});

	describe("Combined use cases", () => {
		it("applies multiple rules correctly", () => {
			const veil = createVeil({
				cliRules: [
					{
						match: /^wrangler\s+(deploy|publish)/,
						action: "deny",
						reason: "Use deployment scripts",
					},
					{
						match: /^wrangler\s+kv/,
						action: "allow",
						reason: "KV access: remember --remote for production",
					},
					{
						match: /^rm\s+-rf/,
						action: "deny",
						reason: "Dangerous command",
					},
				],
			});

			// Blocked
			expect(veil.checkCommand("wrangler deploy").ok).toBe(false);
			expect(veil.checkCommand("rm -rf /tmp").ok).toBe(false);

			// Allowed with context
			const kvResult = veil.checkCommand("wrangler kv:key list");
			expect(kvResult.ok).toBe(true);
			expect(kvResult.context).toBe("KV access: remember --remote for production");

			// Allowed without context (no matching rule)
			expect(veil.checkCommand("wrangler dev").ok).toBe(true);
		});
	});
});
