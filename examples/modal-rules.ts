/**
 * Example: Modal Rules - Strict vs Passive Modes
 *
 * Demonstrates how rules can operate in two modes:
 * - strict: Block access completely with a custom message
 * - passive: Allow access but inject additional context/guidance
 */

import {
	type RulesConfig,
	buildConfigFromRules,
	createVeil,
	getDefaultContext,
	getDefaultStrictMessage,
	registerModalRules,
	registerPlatformRules,
} from "../src";

// Register all rules
registerPlatformRules();
registerModalRules();

console.log("=== Modal Rules Demo: Strict vs Passive Modes ===\n");

// ============================================================================
// Example 1: Wrangler in PASSIVE mode (default)
// The AI can use wrangler but gets helpful context
// ============================================================================
console.log("📋 Example 1: Wrangler in PASSIVE mode");
console.log("   AI can run wrangler commands but gets context about environments\n");

const passiveRules: RulesConfig = {
	"cli/wrangler": ["error", { mode: "passive" }],
};

const veilPassive = createVeil(buildConfigFromRules(passiveRules));
const wranglerResult = veilPassive.checkCommand("wrangler deploy");

console.log("   Command: wrangler deploy");
console.log(`   Allowed: ${wranglerResult.ok}`);
if (wranglerResult.ok) {
	// In passive mode, the context/reason contains helpful information
	console.log("\n   📖 Injected Context:");
	console.log(`   ${getDefaultContext("cli/wrangler")?.split("\n").slice(0, 5).join("\n   ")}`);
	console.log("   ...");
}

console.log(`\n${"=".repeat(60)}\n`);

// ============================================================================
// Example 2: Wrangler in STRICT mode
// The AI is blocked from using wrangler entirely
// ============================================================================
console.log("🚫 Example 2: Wrangler in STRICT mode");
console.log("   AI cannot run wrangler commands at all\n");

const strictRules: RulesConfig = {
	"cli/wrangler": ["error", { mode: "strict" }],
};

const veilStrict = createVeil(buildConfigFromRules(strictRules));
const blockedResult = veilStrict.checkCommand("wrangler deploy");

console.log("   Command: wrangler deploy");
console.log(`   Allowed: ${blockedResult.ok}`);
if (!blockedResult.ok) {
	console.log(`   Reason: ${blockedResult.reason}`);
	console.log("\n   📖 Default Strict Message:");
	console.log(
		`   ${getDefaultStrictMessage("cli/wrangler")?.split("\n").slice(0, 3).join("\n   ")}`,
	);
}

console.log(`\n${"=".repeat(60)}\n`);

// ============================================================================
// Example 3: Custom messages for your project
// ============================================================================
console.log("✨ Example 3: Custom messages for your project\n");

const customRules: RulesConfig = {
	"cli/wrangler": [
		"error",
		{
			mode: "strict",
			message: `
⛔ Wrangler is managed by the Platform team.

Our Workers are deployed via GitHub Actions:
- Push to 'main' deploys to production
- Push to 'staging' deploys to preview

For local development, use: npm run dev:worker

Questions? Slack #platform-team
			`.trim(),
		},
	],
};

const veilCustom = createVeil(buildConfigFromRules(customRules));
const customResult = veilCustom.checkCommand("wrangler deploy --env production");

console.log("   Command: wrangler deploy --env production");
console.log(`   Allowed: ${customResult.ok}`);
if (!customResult.ok && "reason" in customResult) {
	console.log(`\n   Blocked Reason: ${customResult.reason}`);
}

console.log(`\n${"=".repeat(60)}\n`);

// ============================================================================
// Example 4: Passive mode with custom context
// ============================================================================
console.log("📝 Example 4: Passive mode with custom context\n");

const customContextRules: RulesConfig = {
	"cli/wrangler": [
		"error",
		{
			mode: "passive",
			context: `
## Project Wrangler Setup

This project uses Cloudflare Workers for:
- API endpoints (workers/api)
- Edge caching (workers/cache)
- Auth middleware (workers/auth)

**Environment Bindings:**
- KV: USER_SESSIONS, RATE_LIMITS
- R2: UPLOADS, ASSETS
- D1: main-db (production), dev-db (development)

**Secrets (set via wrangler secret):**
- AUTH_SECRET
- STRIPE_KEY
- DATABASE_URL
			`.trim(),
		},
	],
};

const veilContext = createVeil(buildConfigFromRules(customContextRules));
const contextResult = veilContext.checkCommand("wrangler dev");

console.log("   Command: wrangler dev");
console.log(`   Allowed: ${contextResult.ok}`);
console.log("   Context: Custom project-specific documentation injected");

console.log(`\n${"=".repeat(60)}\n`);

// ============================================================================
// Example 5: Multiple modal rules together
// ============================================================================
console.log("🔧 Example 5: Multiple modal rules together\n");

const mixedRules: RulesConfig = {
	// Strict - block these entirely
	"cli/wrangler": ["error", { mode: "strict" }],
	"cli/terraform": ["error", { mode: "strict" }],

	// Passive - allow with context
	"cli/docker": ["error", { mode: "passive" }],
	"tooling/npm": ["error", { mode: "passive" }],

	// Also include some platform rules
	"linux/no-delete-root": "error",
	"env/mask-aws": "error",
};

const veilMixed = createVeil(buildConfigFromRules(mixedRules, "linux"));

const commands = [
	"wrangler deploy",
	"terraform apply",
	"docker build -t myapp .",
	"npm install lodash",
	"rm -rf /",
];

console.log("   Testing commands:\n");
for (const cmd of commands) {
	const result = veilMixed.checkCommand(cmd);
	const status = result.ok ? "✅ allowed" : "❌ blocked";
	console.log(`   ${cmd.padEnd(30)} ${status}`);
}

console.log(`\n${"=".repeat(60)}\n`);

// ============================================================================
// Example 6: File-based blocking in strict mode
// ============================================================================
console.log("📁 Example 6: File-based blocking in strict mode\n");

const fileRules: RulesConfig = {
	"cli/wrangler": ["error", { mode: "strict" }],
	"cli/terraform": ["error", { mode: "strict" }],
};

const veilFiles = createVeil(buildConfigFromRules(fileRules));

const files = ["wrangler.toml", "src/index.ts", "main.tf", "variables.tfvars", "package.json"];

console.log("   Checking file access:\n");
for (const file of files) {
	const result = veilFiles.checkFile(file);
	const status = result.ok ? "✅ visible" : "❌ hidden";
	console.log(`   ${file.padEnd(25)} ${status}`);
}

console.log("\n✅ Modal rules demo complete!");
