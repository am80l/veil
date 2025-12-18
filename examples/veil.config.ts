/**
 * Example Veil Configuration
 *
 * This file demonstrates how to configure Veil for use with the MCP server.
 * Copy this to your project root as `veil.config.ts`.
 */

import type { VeilConfig } from "@squadzero/veil";

const config: VeilConfig = {
	// CLI command rules
	cliRules: [
		// Block dangerous commands
		{
			match: /^rm\s+(-rf|-fr)\s+(\/|~|\$HOME)/,
			action: "deny",
			reason: "BLOCKED: Dangerous recursive delete targeting root or home",
			safeAlternatives: ["rm -i <file>", "trash-cli <file>"],
		},
		{
			match: /^git\s+reset\s+--hard/,
			action: "deny",
			reason: "BLOCKED: Discards all uncommitted changes permanently",
			safeAlternatives: ["git stash", "git reset --soft HEAD~1"],
		},
		{
			match: /^git\s+push\s+--force(?!\s*-with-lease)/,
			action: "deny",
			reason: "BLOCKED: Force push can overwrite remote history",
			safeAlternatives: ["git push --force-with-lease"],
		},

		// Block direct deployments
		{
			match: /^wrangler\s+(deploy|publish)/,
			action: "deny",
			reason: "Use CI/CD pipeline for deployments",
			safeAlternatives: ["npm run deploy:staging", "git push origin main"],
		},

		// Allow with guidance
		{
			match: /^wrangler\s+kv:key\s+(get|list|put|delete)(?!.*--remote)/,
			action: "allow",
			reason: "TIP: Add --remote flag to access production KV data",
		},
	],

	// Environment variable rules
	envRules: [
		// Block access to certain secrets
		{
			match: /^(AWS_SECRET|PRIVATE_KEY|DATABASE_PASSWORD)/,
			action: "deny",
			reason: "Direct access to production secrets is not allowed",
		},

		// Mask sensitive tokens (shows last 4 chars)
		{
			match: /_TOKEN$|_KEY$|_SECRET$/,
			action: "mask",
			replacement: "****",
			reason: "Token masked for security",
		},

		// Allow with context
		{
			match: "CLOUDFLARE_API_TOKEN",
			action: "allow",
			reason: "SENSITIVE: This is a production API token - handle with care",
		},

		// Allow public env vars
		{
			match: /^(NODE_ENV|PATH|HOME|USER|SHELL|LANG|TERM)$/,
			action: "allow",
		},
	],

	// File access rules
	fileRules: [
		// Block sensitive files
		{
			match: /\.(pem|key|p12|pfx)$/,
			action: "deny",
			reason: "Private key files are not accessible",
		},
		{
			match: /\.env\.production$/,
			action: "deny",
			reason: "Production env files are restricted",
		},
		{
			match: /\.dev\.vars$/,
			action: "deny",
			reason: "Cloudflare secrets file is restricted",
		},
		{
			match: /wrangler\.toml$/,
			action: "deny",
			reason: "Wrangler config is protected from modification",
		},
		{
			match: /\.git\//,
			action: "deny",
			reason: "Git internals are not accessible",
		},

		// Allow common files
		{
			match: /\.(ts|tsx|js|jsx|json|md|css|html)$/,
			action: "allow",
		},
	],
};

export default config;
