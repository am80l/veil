/**
 * Veil Presets
 *
 * Common rule configurations for typical use cases
 */

import type { CliRule, EnvRule, FileRule, VeilConfig, VeilInjectors } from "./types";

// ============================================================================
// File Rule Presets
// ============================================================================

/**
 * Common directories to hide from LLMs
 */
export const COMMON_HIDDEN_DIRS: FileRule[] = [
	{ match: "node_modules", action: "deny", reason: "Dependencies too large for context" },
	{ match: ".git", action: "deny", reason: "Git internals" },
	{ match: ".svn", action: "deny", reason: "SVN internals" },
	{ match: ".hg", action: "deny", reason: "Mercurial internals" },
	{ match: "dist", action: "deny", reason: "Build output" },
	{ match: "build", action: "deny", reason: "Build output" },
	{ match: ".next", action: "deny", reason: "Next.js build cache" },
	{ match: ".nuxt", action: "deny", reason: "Nuxt build cache" },
	{ match: ".cache", action: "deny", reason: "Cache directory" },
	{ match: "coverage", action: "deny", reason: "Test coverage output" },
];

/**
 * Sensitive file patterns to hide
 */
export const SENSITIVE_FILES: FileRule[] = [
	{ match: /\.env($|\.)/, action: "deny", reason: "Environment file" },
	{ match: /secrets?/i, action: "deny", reason: "Secrets directory/file" },
	{ match: /\.pem$/, action: "deny", reason: "Private key" },
	{ match: /\.key$/, action: "deny", reason: "Private key" },
	{ match: /credentials/i, action: "deny", reason: "Credentials file" },
	{ match: /\.npmrc$/, action: "deny", reason: "NPM config with tokens" },
	{ match: /\.docker\/config\.json/, action: "deny", reason: "Docker credentials" },
];

// ============================================================================
// Environment Variable Presets
// ============================================================================

/**
 * Common sensitive environment variable patterns
 */
export const SENSITIVE_ENV_VARS: EnvRule[] = [
	{ match: /^AWS_/, action: "mask", reason: "AWS credentials" },
	{ match: /^AZURE_/, action: "mask", reason: "Azure credentials" },
	{ match: /^GCP_|^GOOGLE_/, action: "mask", reason: "Google Cloud credentials" },
	{ match: /SECRET/i, action: "mask", reason: "Contains 'secret'" },
	{ match: /PASSWORD/i, action: "deny", reason: "Contains 'password'" },
	{ match: /TOKEN/i, action: "mask", reason: "Contains 'token'" },
	{ match: /API_KEY/i, action: "mask", reason: "API key" },
	{ match: /PRIVATE_KEY/i, action: "deny", reason: "Private key" },
	{ match: /DATABASE_URL/i, action: "deny", reason: "Database connection string" },
	{ match: /REDIS_URL/i, action: "deny", reason: "Redis connection string" },
	{ match: /MONGODB_URI/i, action: "deny", reason: "MongoDB connection string" },
];

// ============================================================================
// CLI Rule Presets
// ============================================================================

/**
 * Dangerous CLI commands to block
 */
export const DANGEROUS_COMMANDS: CliRule[] = [
	{
		match: /^rm\s+-rf\s+[/~]/,
		action: "deny",
		reason: "Recursive delete from root or home",
		safeAlternatives: ["rm -i", "trash", "mv to ~/.trash/"],
	},
	{
		match: /^rm\s+-rf\s+\*/,
		action: "deny",
		reason: "Recursive delete with wildcard",
		safeAlternatives: ["rm -i"],
	},
	{
		match: /^sudo\s+rm/,
		action: "deny",
		reason: "Elevated delete",
		safeAlternatives: ["rm (without sudo)"],
	},
	{
		match: /^chmod\s+777/,
		action: "deny",
		reason: "Insecure permissions",
		safeAlternatives: ["chmod 755", "chmod 644"],
	},
	{
		match: /^curl.*\|\s*(ba)?sh/,
		action: "deny",
		reason: "Piping curl to shell",
		safeAlternatives: ["Download and review script first"],
	},
	{
		match: />\s*\/dev\/sd[a-z]/,
		action: "deny",
		reason: "Writing directly to disk",
	},
	{
		match: /mkfs\./,
		action: "deny",
		reason: "Formatting disk",
	},
	{
		match: /:(){ :|:& };:/,
		action: "deny",
		reason: "Fork bomb",
	},
];

/**
 * Commands that might leak credentials
 */
export const CREDENTIAL_LEAK_COMMANDS: CliRule[] = [
	{
		match: /curl.*(-u|--user)\s/,
		action: "deny",
		reason: "Curl with credentials",
		safeAlternatives: ["Use environment variables or config files"],
	},
	{
		match: /curl.*password=/i,
		action: "deny",
		reason: "Password in URL",
	},
	{
		match: /echo.*\$\{?(PASSWORD|SECRET|TOKEN|API_KEY)/i,
		action: "deny",
		reason: "Echoing sensitive variable",
	},
];

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Recommended preset for general development
 * Blocks common sensitive files/dirs and dangerous commands
 */
export const PRESET_RECOMMENDED: VeilConfig = {
	fileRules: [...COMMON_HIDDEN_DIRS, ...SENSITIVE_FILES],
	envRules: SENSITIVE_ENV_VARS,
	cliRules: [...DANGEROUS_COMMANDS, ...CREDENTIAL_LEAK_COMMANDS],
};

/**
 * Strict preset for maximum security
 * Denies more aggressively, masks instead of allowing
 */
export const PRESET_STRICT: VeilConfig = {
	fileRules: [
		...COMMON_HIDDEN_DIRS,
		...SENSITIVE_FILES,
		{ match: /config/i, action: "mask", reason: "Config files may contain secrets" },
		{ match: /\.json$/, action: "mask", reason: "JSON files may contain config" },
	],
	envRules: [
		...SENSITIVE_ENV_VARS,
		{ match: /.*/, action: "mask", reason: "Mask all env vars by default" },
	],
	cliRules: [
		...DANGEROUS_COMMANDS,
		...CREDENTIAL_LEAK_COMMANDS,
		{ match: /^sudo\s/, action: "deny", reason: "All sudo commands blocked" },
		{ match: /^docker\s+run/, action: "deny", reason: "Docker run blocked" },
	],
};

/**
 * Minimal preset - just the essentials
 */
export const PRESET_MINIMAL: VeilConfig = {
	fileRules: [
		{ match: ".env", action: "deny" },
		{ match: /secrets?/i, action: "deny" },
	],
	envRules: [{ match: /PASSWORD|SECRET|TOKEN|KEY/i, action: "mask" }],
	cliRules: [{ match: /^rm\s+-rf/, action: "deny", safeAlternatives: ["rm -i"] }],
};

/**
 * CI/CD preset - safe for automated pipelines
 */
export const PRESET_CI: VeilConfig = {
	fileRules: SENSITIVE_FILES,
	envRules: [
		...SENSITIVE_ENV_VARS,
		{ match: "CI", action: "allow" },
		{ match: /^GITHUB_/, action: "allow" },
		{ match: /^GITLAB_/, action: "allow" },
		{ match: /^CIRCLE/, action: "allow" },
		{ match: /^TRAVIS/, action: "allow" },
	],
	cliRules: [
		...DANGEROUS_COMMANDS,
		{ match: /npm\s+publish/, action: "deny", reason: "Publishing disabled in CI" },
		{ match: /git\s+push.*--force/, action: "deny", safeAlternatives: ["git push"] },
	],
};

// ============================================================================
// Helper to merge presets
// ============================================================================

/**
 * Merge multiple Veil configurations
 * Later configs take precedence (their rules are checked first)
 */
export function mergeConfigs(...configs: VeilConfig[]): VeilConfig {
	const result: VeilConfig = {
		fileRules: configs.flatMap((c) => c.fileRules ?? []),
		envRules: configs.flatMap((c) => c.envRules ?? []),
		cliRules: configs.flatMap((c) => c.cliRules ?? []),
	};

	// Merge injectors if any config has them
	const injectorConfigs = configs.filter((c) => c.injectors !== undefined);
	if (injectorConfigs.length > 0) {
		const mergedInjectors: VeilInjectors = {};
		for (const config of injectorConfigs) {
			Object.assign(mergedInjectors, config.injectors);
		}
		result.injectors = mergedInjectors;
	}

	return result;
}
