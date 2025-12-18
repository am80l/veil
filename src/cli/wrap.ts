#!/usr/bin/env node
/**
 * Veil Shell Wrapper
 *
 * Intercepts commands and validates them against veil rules before execution.
 * Used as a shell wrapper to enforce security policies at the shell level.
 *
 * By default, only activates when VEIL_ENABLED=1 is set (AI-only mode).
 * Set VEIL_ENABLED=1 in VS Code terminal settings to protect AI commands
 * while leaving human terminals unaffected.
 *
 * Usage:
 *   veil-wrap wrangler deploy --env production
 *   veil-wrap <any-command>
 *
 * Environment:
 *   VEIL_ENABLED=1     - Enable veil checking (required by default)
 *   VEIL_FORCE=1       - Force veil checking even without VEIL_ENABLED
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { VeilConfig } from "../types.js";
import { createVeil } from "../veil.js";

/**
 * Check if veil should be active based on environment
 */
function isVeilActive(): boolean {
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation
	const veilEnabled = process.env["VEIL_ENABLED"];
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation
	const veilForce = process.env["VEIL_FORCE"];

	// Force mode always activates
	if (veilForce === "1" || veilForce === "true") {
		return true;
	}

	// Default: only activate if explicitly enabled (AI terminal)
	return veilEnabled === "1" || veilEnabled === "true";
}

/**
 * Find veil config file by searching up the directory tree
 */
function findConfigDir(startDir: string): string | null {
	let dir = startDir;
	const configFiles = ["veil.config.ts", "veil.config.js", "veil.config.mjs"];

	while (dir !== dirname(dir)) {
		for (const configFile of configFiles) {
			if (existsSync(join(dir, configFile))) {
				return dir;
			}
		}
		dir = dirname(dir);
	}

	return null;
}

/**
 * Load veil config from a directory
 */
async function loadConfig(configDir: string): Promise<VeilConfig | undefined> {
	const configFiles = ["veil.config.ts", "veil.config.js", "veil.config.mjs"];

	for (const configFile of configFiles) {
		const fullPath = join(configDir, configFile);
		if (existsSync(fullPath)) {
			try {
				const loaded = (await import(pathToFileURL(fullPath).href)) as {
					default?: VeilConfig;
				} & VeilConfig;
				return loaded.default ?? loaded;
			} catch {
				// Try next config file
			}
		}
	}

	return undefined;
}

/**
 * Execute a command with inherited stdio
 */
function execCommand(command: string, cwd: string): void {
	const child: ChildProcess = spawn(command, {
		stdio: "inherit",
		cwd,
		shell: true,
	});

	child.on("exit", (code: number | null) => {
		process.exit(code ?? 0);
	});

	child.on("error", (err: Error) => {
		console.error(`Failed to execute command: ${err.message}`);
		process.exit(1);
	});
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error("Usage: veil-wrap <command> [args...]");
		console.error("");
		console.error("Examples:");
		console.error("  veil-wrap wrangler deploy --env production");
		console.error("  veil-wrap npm run deploy");
		console.error("");
		console.error("Environment:");
		console.error("  VEIL_ENABLED=1  Enable checking (for AI terminals)");
		console.error("  VEIL_FORCE=1    Force checking (for all terminals)");
		process.exit(1);
	}

	const command = args.join(" ");
	const cwd = process.cwd();

	// Check if veil should be active
	if (!isVeilActive()) {
		// Pass through without checking
		execCommand(command, cwd);
		return;
	}

	// Find veil config
	const configDir = findConfigDir(cwd);

	if (!configDir) {
		// No veil config found, pass through without validation
		execCommand(command, cwd);
		return;
	}

	// Load config and validate command
	const originalCwd = process.cwd();
	process.chdir(configDir);

	try {
		const config = await loadConfig(configDir);
		process.chdir(originalCwd);

		if (!config) {
			// Config failed to load, pass through
			execCommand(command, cwd);
			return;
		}

		const veil = createVeil(config);
		const result = veil.checkCommand(command);

		if (!result.ok && result.blocked) {
			console.error("");
			console.error("🛡️  Command blocked by Veil security policy");
			console.error("");

			if (result.reason) {
				console.error(`Reason: ${result.reason}`);
				console.error("");
			}

			if (result.safeAlternatives && result.safeAlternatives.length > 0) {
				console.error("Safe alternatives:");
				for (const alt of result.safeAlternatives) {
					console.error(`  - ${alt}`);
				}
				console.error("");
			}

			process.exit(1);
		}

		// Command allowed - execute it (possibly rewritten)
		const finalCommand = result.command ?? command;

		if (result.command && result.command !== command) {
			console.log(`🛡️  Veil: Command rewritten to: ${finalCommand}`);
			console.log("");
		}

		execCommand(finalCommand, cwd);
	} catch (error: unknown) {
		process.chdir(originalCwd);
		// Config error - log and pass through
		console.error(
			`[veil-wrap] Config error: ${error instanceof Error ? error.message : String(error)}`,
		);
		execCommand(command, cwd);
	}
}

main().catch((error: unknown) => {
	console.error("[veil-wrap] Error:", error instanceof Error ? error.message : String(error));
	process.exit(1);
});
