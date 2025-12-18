#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Command } from "commander";
import { version } from "../../package.json";
import {
	PRESET_CI,
	PRESET_MINIMAL,
	PRESET_RECOMMENDED,
	PRESET_STRICT,
	mergeConfigs,
} from "../presets";
import {
	ensureRulesRegistered,
	getRule,
	listPacks,
	listRules,
	registerModalRules,
	registerPlatformRules,
} from "../rules";
import type { VeilConfig } from "../types";
import { createVeil } from "../veil";

// Register all built-in rules on CLI startup
registerPlatformRules();
registerModalRules();

const CONFIG_FILENAME = ".veilrc.json";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function colorize(text: string, color: "red" | "green" | "yellow" | "cyan" | "gray"): string {
	const colors: Record<string, string> = {
		red: "\x1b[31m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		cyan: "\x1b[36m",
		gray: "\x1b[90m",
	};
	return `${colors[color]}${text}\x1b[0m`;
}

function findConfigFile(startDir: string = process.cwd()): string | null {
	let dir = startDir;
	while (dir !== dirname(dir)) {
		const configPath = join(dir, CONFIG_FILENAME);
		if (existsSync(configPath)) {
			return configPath;
		}
		dir = dirname(dir);
	}
	return null;
}

function loadConfig(): VeilConfig | null {
	const configPath = findConfigFile();
	if (!configPath) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(content) as VeilConfig & { extends?: string };

		// Convert string patterns back to RegExp where appropriate
		const convertMatch = (match: string | RegExp): string | RegExp => {
			if (typeof match !== "string") return match;
			return match.startsWith("^") || match.includes("|") ? new RegExp(match, "i") : match;
		};

		const result: VeilConfig = {};

		if (parsed.fileRules) {
			result.fileRules = parsed.fileRules.map((rule) => ({
				...rule,
				match: convertMatch(rule.match),
			}));
		}

		if (parsed.envRules) {
			result.envRules = parsed.envRules.map((rule) => ({
				...rule,
				match: convertMatch(rule.match),
			}));
		}

		if (parsed.cliRules) {
			result.cliRules = parsed.cliRules.map((rule) => ({
				...rule,
				match: convertMatch(rule.match),
			}));
		}

		// Handle extends - merge with base preset
		if (parsed.extends) {
			const preset = PRESETS[parsed.extends];
			if (preset) {
				// User rules take precedence (checked first), then preset rules
				return mergeConfigs(result, preset);
			}
			console.error(colorize(`Unknown preset: ${parsed.extends}`, "yellow"));
		}

		return result;
	} catch (error) {
		console.error(colorize(`Failed to parse ${CONFIG_FILENAME}:`, "red"), error);
		return null;
	}
}

function saveConfig(config: VeilConfig, filePath: string, presetName?: string): void {
	// If a preset name is provided, use extends for a minimal config
	if (presetName) {
		const minimalConfig = { extends: presetName };
		writeFileSync(filePath, `${JSON.stringify(minimalConfig, null, 2)}\n`);
		return;
	}

	// Convert RegExp to string for JSON serialization
	const serializableConfig = {
		fileRules: config.fileRules?.map((rule) => ({
			...rule,
			match: rule.match instanceof RegExp ? rule.match.source : rule.match,
		})),
		envRules: config.envRules?.map((rule) => ({
			...rule,
			match: rule.match instanceof RegExp ? rule.match.source : rule.match,
		})),
		cliRules: config.cliRules?.map((rule) => ({
			...rule,
			match: rule.match instanceof RegExp ? rule.match.source : rule.match,
		})),
	};

	writeFileSync(filePath, `${JSON.stringify(serializableConfig, null, 2)}\n`);
}

function walkDir(dir: string, maxDepth = 5, currentDepth = 0): string[] {
	if (currentDepth >= maxDepth) return [];

	const files: string[] = [];
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				// Skip common large directories
				if (
					["node_modules", ".git", "dist", "build", ".next", "coverage", ".cache"].includes(
						entry.name,
					)
				) {
					continue;
				}
				files.push(...walkDir(fullPath, maxDepth, currentDepth + 1));
			} else {
				files.push(fullPath);
			}
		}
	} catch {
		// Ignore permission errors
	}
	return files;
}

function printResult(
	target: string,
	result: { ok: boolean; reason?: string; safeAlternatives?: string[] },
): void {
	if (result.ok) {
		console.log(colorize("✓ ALLOWED", "green"), target);
	} else {
		console.log(colorize("✗ BLOCKED", "red"), target);
		if (result.reason) {
			console.log(colorize(`  Reason: ${result.reason}`, "gray"));
		}
		if (result.safeAlternatives?.length) {
			console.log(colorize("  Safe alternatives:", "gray"));
			for (const alt of result.safeAlternatives) {
				console.log(colorize(`    - ${alt}`, "cyan"));
			}
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS: Record<string, VeilConfig> = {
	recommended: PRESET_RECOMMENDED,
	strict: PRESET_STRICT,
	minimal: PRESET_MINIMAL,
	ci: PRESET_CI,
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI Program
// ─────────────────────────────────────────────────────────────────────────────

const program = new Command();

program.name("veil").description("Veil: LLM visibility firewall CLI").version(version);

// ─────────────────────────────────────────────────────────────────────────────
// init - Scaffold a .veilrc.json config file
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("init")
	.description("Scaffold a .veilrc.json config file")
	.option("-p, --preset <preset>", "Use a preset (recommended, strict, minimal, ci)", "recommended")
	.option("-f, --force", "Overwrite existing config file")
	.action((options: { preset: string; force?: boolean }): void => {
		const configPath = join(process.cwd(), CONFIG_FILENAME);

		if (existsSync(configPath) && !options.force) {
			console.log(
				colorize(`${CONFIG_FILENAME} already exists. Use --force to overwrite.`, "yellow"),
			);
			return;
		}

		const preset = PRESETS[options.preset];
		if (!preset) {
			console.log(colorize(`Unknown preset: ${options.preset}`, "red"));
			console.log(`Available presets: ${Object.keys(PRESETS).join(", ")}`);
			return;
		}

		// Pass preset name to generate minimal config with extends
		saveConfig(preset, configPath, options.preset);
		console.log(colorize(`✓ Created ${CONFIG_FILENAME} with "${options.preset}" preset`, "green"));
		console.log(colorize(`  ${configPath}`, "gray"));
		console.log();
		console.log("Edit this file to customize your Veil rules, or use:");
		console.log(colorize("  veil add-rule -t file -m 'secrets/' -a deny", "cyan"));
	});

// ─────────────────────────────────────────────────────────────────────────────
// check - Check if a file, env var, or command would be allowed/blocked
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("check <target>")
	.description("Check if a file, env var, or command would be allowed/blocked")
	.option("-t, --type <type>", "Type of check: file, env, or cli", "file")
	.action((target: string, options: { type: string }): void => {
		let config = loadConfig();
		if (!config) {
			console.log(colorize(`No ${CONFIG_FILENAME} found. Using recommended preset.`, "yellow"));
			config = PRESET_RECOMMENDED;
		}

		const veil = createVeil(config);

		switch (options.type) {
			case "file": {
				const result = veil.checkFile(target);
				printResult(target, result);
				break;
			}
			case "env": {
				const result = veil.getEnv(target);
				printResult(target, result);
				break;
			}
			case "cli":
			case "cmd":
			case "command": {
				const result = veil.checkCommand(target);
				printResult(target, result);
				break;
			}
			default:
				console.log(colorize(`Unknown type: ${options.type}. Use file, env, or cli.`, "red"));
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// scan - Scan project for sensitive files
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("scan")
	.description("Scan project for sensitive files that would be blocked")
	.option("-d, --dir <directory>", "Directory to scan", ".")
	.option("--depth <depth>", "Maximum directory depth", "5")
	.option("-v, --verbose", "Show all files, not just blocked ones")
	.action((options: { dir: string; depth: string; verbose?: boolean }): void => {
		let config = loadConfig();
		if (!config) {
			console.log(colorize(`No ${CONFIG_FILENAME} found. Using recommended preset.`, "yellow"));
			config = PRESET_RECOMMENDED;
		}

		const veil = createVeil(config);
		const scanDir = resolve(options.dir);
		const maxDepth = Number.parseInt(options.depth, 10);

		console.log(colorize(`Scanning ${scanDir}...`, "cyan"));
		console.log();

		const files = walkDir(scanDir, maxDepth);
		const blocked: { path: string; reason?: string }[] = [];
		const allowed: string[] = [];

		for (const file of files) {
			const relativePath = relative(scanDir, file);
			const result = veil.checkFile(relativePath);
			if (result.ok) {
				allowed.push(relativePath);
			} else {
				blocked.push({ path: relativePath, reason: result.reason });
			}
		}

		// Show blocked files
		console.log(colorize("─ Blocked Files ─", "red"));
		if (blocked.length === 0) {
			console.log(colorize("  No sensitive files found", "gray"));
		} else {
			for (const item of blocked.slice(0, 30)) {
				console.log(colorize("  ✗", "red"), item.path);
				if (item.reason && options.verbose) {
					console.log(colorize(`    ${item.reason}`, "gray"));
				}
			}
			if (blocked.length > 30) {
				console.log(colorize(`  ... and ${blocked.length - 30} more`, "gray"));
			}
		}

		// Show allowed files if verbose
		if (options.verbose) {
			console.log();
			console.log(colorize("─ Allowed Files ─", "green"));
			for (const file of allowed.slice(0, 20)) {
				console.log(colorize("  ✓", "green"), file);
			}
			if (allowed.length > 20) {
				console.log(colorize(`  ... and ${allowed.length - 20} more`, "gray"));
			}
		}

		// Summary
		console.log();
		console.log(colorize("─ Summary ─", "cyan"));
		console.log(`  Total files scanned: ${files.length}`);
		console.log(colorize(`  Blocked: ${blocked.length}`, blocked.length > 0 ? "red" : "gray"));
		console.log(colorize(`  Allowed: ${allowed.length}`, "green"));
	});

// ─────────────────────────────────────────────────────────────────────────────
// add-rule - Add a rule to .veilrc.json
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("add-rule")
	.description("Add a rule to .veilrc.json")
	.requiredOption("-t, --type <type>", "Rule type: file, env, or cli")
	.requiredOption("-m, --match <pattern>", "Pattern to match")
	.requiredOption("-a, --action <action>", "Action: allow, deny, mask, or rewrite")
	.option("-r, --reason <reason>", "Reason for the rule")
	.option("--alternatives <alternatives>", "Safe alternatives (comma-separated)")
	.action(
		(options: {
			type: string;
			match: string;
			action: string;
			reason?: string;
			alternatives?: string;
		}): void => {
			const configPath = findConfigFile() ?? join(process.cwd(), CONFIG_FILENAME);
			let config: VeilConfig = {};

			if (existsSync(configPath)) {
				try {
					config = JSON.parse(readFileSync(configPath, "utf-8")) as VeilConfig;
				} catch {
					console.log(colorize("Error reading config, creating new one.", "yellow"));
				}
			}

			const newRule: Record<string, unknown> = {
				match: options.match,
				action: options.action,
				...(options.reason && { reason: options.reason }),
				...(options.alternatives && {
					safeAlternatives: options.alternatives.split(",").map((s) => s.trim()),
				}),
			};

			const ruleKey = `${options.type}Rules` as "fileRules" | "envRules" | "cliRules";
			if (!config[ruleKey]) {
				(config as Record<string, unknown[]>)[ruleKey] = [];
			}
			(config[ruleKey] as unknown[]).push(newRule);

			saveConfig(config, configPath);
			console.log(
				colorize(`✓ Added ${options.type} rule: ${options.match} → ${options.action}`, "green"),
			);
		},
	);

// ─────────────────────────────────────────────────────────────────────────────
// remove-rule - Remove a rule from .veilrc.json
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("remove-rule")
	.description("Remove a rule from .veilrc.json by pattern")
	.requiredOption("-m, --match <pattern>", "Pattern to remove")
	.option("-t, --type <type>", "Rule type (file, env, cli)", "file")
	.action((options: { match: string; type: string }): void => {
		const configPath = findConfigFile();
		if (!configPath) {
			console.log(colorize(`No ${CONFIG_FILENAME} found.`, "red"));
			return;
		}

		const config: VeilConfig = JSON.parse(readFileSync(configPath, "utf-8")) as VeilConfig;
		const state = { removed: false };

		const filterRules = <T extends { match: string | RegExp }>(
			rules: T[] | undefined,
		): T[] | undefined => {
			if (!rules) return undefined;
			const filtered = rules.filter((r) => String(r.match) !== options.match);
			if (filtered.length < rules.length) {
				state.removed = true;
			}
			return filtered.length > 0 ? filtered : undefined;
		};

		const applyFilter = (key: "fileRules" | "envRules" | "cliRules"): void => {
			const result = filterRules(config[key]);
			if (result === undefined) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete config[key];
			} else {
				// Safe assignment since result is definitely an array here
				(config as Record<string, unknown>)[key] = result;
			}
		};

		switch (options.type) {
			case "file":
				applyFilter("fileRules");
				break;
			case "env":
				applyFilter("envRules");
				break;
			case "cli":
			case "cmd":
				applyFilter("cliRules");
				break;
		}

		if (state.removed) {
			saveConfig(config, configPath);
			console.log(colorize(`✓ Removed rule: ${options.match}`, "green"));
		} else {
			console.log(colorize(`Rule not found: ${options.match}`, "yellow"));
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// list-rules - List all available built-in rules
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("list-rules")
	.description("List all available built-in rules")
	.option("-c, --category <category>", "Filter by category (file, env, cli)")
	.action((options: { category?: string }): void => {
		ensureRulesRegistered();
		const rules = listRules();

		console.log(colorize("─ Available Built-in Rules ─", "cyan"));
		console.log();

		let count = 0;
		for (const ruleId of rules) {
			const rule = getRule(ruleId);
			if (!rule) continue;

			if (options.category && rule.category !== options.category) {
				continue;
			}

			const severityColor = rule.defaultSeverity === "error" ? "red" : "yellow";
			console.log(`${colorize("●", severityColor)} ${colorize(ruleId, "cyan")}`);
			console.log(colorize(`   ${rule.description}`, "gray"));
			count++;
		}

		console.log();
		console.log(colorize(`Total: ${count} rules`, "gray"));
	});

// ─────────────────────────────────────────────────────────────────────────────
// list-packs - List all available rule packs
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("list-packs")
	.description("List all available rule packs")
	.action((): void => {
		ensureRulesRegistered();
		const packs = listPacks();

		console.log(colorize("─ Available Rule Packs ─", "cyan"));
		console.log();

		for (const pack of packs) {
			console.log(colorize(`● ${pack}`, "cyan"));
		}

		console.log();
		console.log(colorize("─ Available Presets ─", "cyan"));
		console.log();
		for (const preset of Object.keys(PRESETS)) {
			console.log(colorize(`● ${preset}`, "green"));
		}

		console.log();
		console.log(colorize("Use with: veil init --preset <name>", "gray"));
		console.log(colorize("Or:       veil apply-pack <name>", "gray"));
	});

// ─────────────────────────────────────────────────────────────────────────────
// show-config - Print the current resolved config
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("show-config")
	.description("Print the current resolved config")
	.option("-r, --resolved", "Show fully resolved config with inherited preset rules expanded")
	.option("-j, --json", "Output as JSON (use with --resolved)")
	.action((options: { resolved?: boolean; json?: boolean }): void => {
		const configPath = findConfigFile();

		if (!configPath) {
			console.log(colorize(`No ${CONFIG_FILENAME} found.`, "yellow"));
			console.log(colorize("Run `veil init` to create one.", "gray"));
			return;
		}

		console.log(colorize(`Config: ${configPath}`, "cyan"));
		console.log();

		if (options.resolved) {
			// Load raw config to detect extends
			const rawContent = readFileSync(configPath, "utf-8");
			const rawConfig = JSON.parse(rawContent) as VeilConfig & { extends?: string };
			const extendsPreset = rawConfig.extends;

			// Get preset rules for comparison
			const presetConfig = extendsPreset ? PRESETS[extendsPreset] : null;
			const presetFilePatterns = new Set(
				presetConfig?.fileRules?.map((r) =>
					r.match instanceof RegExp ? r.match.source : r.match,
				) ?? [],
			);
			const presetEnvPatterns = new Set(
				presetConfig?.envRules?.map((r) =>
					r.match instanceof RegExp ? r.match.source : r.match,
				) ?? [],
			);
			const presetCliPatterns = new Set(
				presetConfig?.cliRules?.map((r) =>
					r.match instanceof RegExp ? r.match.source : r.match,
				) ?? [],
			);

			// Load resolved config
			const config = loadConfig();
			if (!config) return;

			if (options.json) {
				// JSON output
				const displayConfig = {
					fileRules: config.fileRules?.map((r) => ({
						...r,
						match: r.match instanceof RegExp ? r.match.source : r.match,
					})),
					envRules: config.envRules?.map((r) => ({
						...r,
						match: r.match instanceof RegExp ? r.match.source : r.match,
					})),
					cliRules: config.cliRules?.map((r) => ({
						...r,
						match: r.match instanceof RegExp ? r.match.source : r.match,
					})),
				};
				console.log(JSON.stringify(displayConfig, null, 2));
				return;
			}

			// Pretty formatted output
			if (extendsPreset) {
				console.log(`${colorize("Extends:", "cyan")} ${colorize(extendsPreset, "green")}`);
				console.log();
			}

			const formatMatch = (match: string | RegExp): string => {
				const str = match instanceof RegExp ? match.source : match;
				return str.length > 50 ? `${str.substring(0, 47)}...` : str;
			};

			const isFromPreset = (pattern: string | RegExp, presetSet: Set<string>): boolean => {
				const str = pattern instanceof RegExp ? pattern.source : pattern;
				return presetSet.has(str);
			};

			// File Rules
			if (config.fileRules?.length) {
				console.log(colorize("─── File Rules ───", "cyan"));
				for (const rule of config.fileRules) {
					const fromPreset = isFromPreset(rule.match, presetFilePatterns);
					const source = fromPreset
						? colorize(`[${extendsPreset}]`, "gray")
						: colorize("[custom]", "yellow");
					const action =
						rule.action === "deny"
							? colorize("DENY", "red")
							: rule.action === "mask"
								? colorize("MASK", "yellow")
								: colorize("ALLOW", "green");
					console.log(`  ${action} ${formatMatch(rule.match)} ${source}`);
				}
				console.log();
			}

			// Env Rules
			if (config.envRules?.length) {
				console.log(colorize("─── Env Rules ───", "cyan"));
				for (const rule of config.envRules) {
					const fromPreset = isFromPreset(rule.match, presetEnvPatterns);
					const source = fromPreset
						? colorize(`[${extendsPreset}]`, "gray")
						: colorize("[custom]", "yellow");
					const action =
						rule.action === "deny"
							? colorize("DENY", "red")
							: rule.action === "mask"
								? colorize("MASK", "yellow")
								: colorize("ALLOW", "green");
					console.log(`  ${action} ${formatMatch(rule.match)} ${source}`);
				}
				console.log();
			}

			// CLI Rules
			if (config.cliRules?.length) {
				console.log(colorize("─── CLI Rules ───", "cyan"));
				for (const rule of config.cliRules) {
					const fromPreset = isFromPreset(rule.match, presetCliPatterns);
					const source = fromPreset
						? colorize(`[${extendsPreset}]`, "gray")
						: colorize("[custom]", "yellow");
					const action =
						rule.action === "deny"
							? colorize("DENY", "red")
							: rule.action === "rewrite"
								? colorize("REWRITE", "yellow")
								: colorize("ALLOW", "green");
					console.log(`  ${action} ${formatMatch(rule.match)} ${source}`);
				}
				console.log();
			}

			// Summary
			const customFile =
				config.fileRules?.filter((r) => !isFromPreset(r.match, presetFilePatterns)).length ?? 0;
			const customEnv =
				config.envRules?.filter((r) => !isFromPreset(r.match, presetEnvPatterns)).length ?? 0;
			const customCli =
				config.cliRules?.filter((r) => !isFromPreset(r.match, presetCliPatterns)).length ?? 0;
			const totalCustom = customFile + customEnv + customCli;
			const totalPreset =
				(config.fileRules?.length ?? 0) +
				(config.envRules?.length ?? 0) +
				(config.cliRules?.length ?? 0) -
				totalCustom;

			console.log(colorize("─── Summary ───", "cyan"));
			console.log(
				`  Total rules: ${(config.fileRules?.length ?? 0) + (config.envRules?.length ?? 0) + (config.cliRules?.length ?? 0)}`,
			);
			if (extendsPreset) {
				console.log(`  From ${colorize(extendsPreset, "green")}: ${totalPreset}`);
			}
			console.log(`  ${colorize("Custom", "yellow")}: ${totalCustom}`);
		} else {
			const content = readFileSync(configPath, "utf-8");
			console.log(content);
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// apply-pack - Apply a preset pack to .veilrc.json
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("apply-pack <pack>")
	.description("Apply a preset pack to .veilrc.json (merges with existing)")
	.action((pack: string): void => {
		const preset = PRESETS[pack];
		if (!preset) {
			console.log(colorize(`Unknown pack: ${pack}`, "red"));
			console.log(`Available packs: ${Object.keys(PRESETS).join(", ")}`);
			return;
		}

		const configPath = findConfigFile() ?? join(process.cwd(), CONFIG_FILENAME);
		let config: VeilConfig = {};

		if (existsSync(configPath)) {
			try {
				config = JSON.parse(readFileSync(configPath, "utf-8")) as VeilConfig;
			} catch {
				// Start fresh
			}
		}

		const merged = mergeConfigs(config, preset);
		saveConfig(merged, configPath);
		console.log(colorize(`✓ Applied "${pack}" pack to ${CONFIG_FILENAME}`, "green"));
	});

// ─────────────────────────────────────────────────────────────────────────────
// explain - Explain why an item is blocked or allowed
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("explain <target>")
	.description("Explain why a file, env var, or command is blocked or allowed")
	.option("-t, --type <type>", "Type of target (file, env, cli)", "file")
	.action((target: string, options: { type: string }): void => {
		let config = loadConfig();
		if (!config) {
			console.log(colorize(`No ${CONFIG_FILENAME} found. Using recommended preset.`, "yellow"));
			config = PRESET_RECOMMENDED;
		}

		const veil = createVeil(config);

		let result: { ok: boolean; reason?: string; blocked?: boolean; details?: unknown };

		switch (options.type) {
			case "file":
				result = veil.checkFile(target);
				break;
			case "env":
				result = veil.getEnv(target);
				break;
			case "cli":
			case "cmd":
			case "command":
				result = veil.checkCommand(target);
				break;
			default:
				console.log(colorize(`Unknown type: ${options.type}. Use file, env, or cli.`, "red"));
				return;
		}

		console.log(colorize(`─ Explanation for: ${target} ─`, "cyan"));
		console.log();

		if (result.ok) {
			console.log(colorize("Status: ALLOWED", "green"));
			console.log();
			console.log("This target does not match any blocking rules in your config.");
		} else {
			console.log(colorize("Status: BLOCKED", "red"));
			console.log();
			console.log(`Reason: ${result.reason ?? "Unknown"}`);

			if (result.details) {
				console.log();
				console.log(colorize("Details:", "gray"));
				console.log(JSON.stringify(result.details, null, 2));
			}
		}

		// Show matching rules
		console.log();
		console.log(colorize("─ Matching Rules ─", "gray"));

		const rules =
			options.type === "file"
				? config.fileRules
				: options.type === "env"
					? config.envRules
					: config.cliRules;

		if (!rules || rules.length === 0) {
			console.log("  No rules configured for this type.");
			return;
		}

		let matchFound = false;
		for (const rule of rules) {
			const pattern = rule.match;
			const matches =
				typeof pattern === "string"
					? target.includes(pattern)
					: pattern instanceof RegExp
						? pattern.test(target)
						: false;

			if (matches) {
				matchFound = true;
				console.log(colorize(`  ✓ Match: ${String(pattern)} → ${rule.action}`, "yellow"));
			}
		}

		if (!matchFound) {
			console.log("  No matching rules found (default: allow)");
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// install - Add shell wrapper to .zshrc/.bashrc
// ─────────────────────────────────────────────────────────────────────────────

const SHELL_MARKER_START = "# >>> veil shell wrapper >>>";
const SHELL_MARKER_END = "# <<< veil shell wrapper <<<";

function getShellWrapper(commands: string[], forceMode: boolean): string {
	const wrapperFunctions = commands
		.map(
			(cmd) => `${cmd}() {
  if command -v veil-wrap >/dev/null 2>&1; then
    veil-wrap ${cmd} "$@"
  else
    command ${cmd} "$@"
  fi
}`,
		)
		.join("\n\n");

	const modeComment = forceMode
		? "# Mode: FORCE - applies to ALL terminals (humans + AI)"
		: "# Mode: AI-only - only activates when VEIL_ENABLED=1 (set in VS Code)";

	return `${SHELL_MARKER_START}
# Veil intercepts these commands to enforce security policies
# See: https://github.com/Squad-Zero/veil
${modeComment}
${wrapperFunctions}
${SHELL_MARKER_END}`;
}

function getShellConfigPaths(): string[] {
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
	const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
	return [join(home, ".zshrc"), join(home, ".bashrc"), join(home, ".bash_profile")];
}

function detectCurrentShell(): string {
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
	const shell = process.env["SHELL"] ?? "";
	if (shell.includes("zsh")) return "zsh";
	if (shell.includes("bash")) return "bash";
	return "unknown";
}

function getDefaultConfigPath(): string {
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
	const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
	const shell = detectCurrentShell();
	if (shell === "zsh") return join(home, ".zshrc");
	return join(home, ".bashrc");
}

program
	.command("install")
	.description("Add shell wrappers to intercept commands (e.g., wrangler)")
	.option("-s, --shell <path>", "Path to shell config file (auto-detected if not specified)")
	.option("-c, --commands <commands>", "Comma-separated commands to wrap", "wrangler")
	.option("-f, --force", "Apply to ALL terminals (humans + AI). Default is AI-only.")
	.option("--dry-run", "Show what would be added without modifying files")
	.action(
		(options: { shell?: string; commands?: string; force?: boolean; dryRun?: boolean }): void => {
			const commands = (options.commands ?? "wrangler").split(",").map((c) => c.trim());
			const shellConfig = options.shell ?? getDefaultConfigPath();
			const forceMode = options.force ?? false;
			const wrapper = getShellWrapper(commands, forceMode);

			if (options.dryRun) {
				console.log(colorize("─ Dry Run: Shell Wrapper ─", "cyan"));
				console.log();
				console.log(`Would add to: ${colorize(shellConfig, "yellow")}`);
				console.log(`Mode: ${colorize(forceMode ? "FORCE (all terminals)" : "AI-only", "yellow")}`);
				console.log();
				console.log(colorize("Content:", "gray"));
				console.log(wrapper);
				return;
			}

			// Check if file exists
			if (!existsSync(shellConfig)) {
				console.error(colorize(`Shell config not found: ${shellConfig}`, "red"));
				console.error("Use --shell to specify the correct path");
				process.exit(1);
			}

			// Read current content
			const content = readFileSync(shellConfig, "utf-8");

			// Check if already installed
			if (content.includes(SHELL_MARKER_START)) {
				console.log(colorize("Veil shell wrapper already installed!", "yellow"));
				console.log(`Location: ${shellConfig}`);
				console.log();
				console.log("To update, run:");
				console.log(colorize("  veil uninstall && veil install", "cyan"));
				return;
			}

			// Append wrapper
			const newContent = `${content.trimEnd()}\n\n${wrapper}\n`;
			writeFileSync(shellConfig, newContent);

			console.log(colorize("✓ Veil shell wrapper installed!", "green"));
			console.log();
			console.log(`Location: ${colorize(shellConfig, "cyan")}`);
			console.log(`Wrapped commands: ${colorize(commands.join(", "), "yellow")}`);
			console.log(`Mode: ${colorize(forceMode ? "FORCE (all terminals)" : "AI-only", "yellow")}`);
			console.log();

			if (!forceMode) {
				console.log(colorize("─ VS Code Setup (required for AI-only mode) ─", "cyan"));
				console.log();
				console.log("Add to your VS Code settings.json:");
				console.log();
				console.log(
					colorize('  "terminal.integrated.env.linux": { "VEIL_ENABLED": "1" },', "gray"),
				);
				console.log(colorize('  "terminal.integrated.env.osx": { "VEIL_ENABLED": "1" },', "gray"));
				console.log(
					colorize('  "terminal.integrated.env.windows": { "VEIL_ENABLED": "1" }', "gray"),
				);
				console.log();
				console.log("This enables veil ONLY in VS Code terminals (where AI runs).");
				console.log("Human terminals outside VS Code are unaffected.");
				console.log();
			}

			console.log("To activate, run:");
			console.log(colorize(`  source ${shellConfig}`, "cyan"));
			console.log();
			console.log("Or open a new terminal.");
		},
	);

// ─────────────────────────────────────────────────────────────────────────────
// uninstall - Remove shell wrapper from .zshrc/.bashrc
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("uninstall")
	.description("Remove shell wrappers from shell config")
	.option("-s, --shell <path>", "Path to shell config file (auto-detected if not specified)")
	.option("-a, --all", "Remove from all detected shell configs")
	.option("--dry-run", "Show what would be removed without modifying files")
	.action((options: { shell?: string; all?: boolean; dryRun?: boolean }): void => {
		const configs = options.all
			? getShellConfigPaths().filter(existsSync)
			: [options.shell ?? getDefaultConfigPath()];

		let removedAny = false;

		for (const shellConfig of configs) {
			if (!existsSync(shellConfig)) {
				if (!options.all) {
					console.error(colorize(`Shell config not found: ${shellConfig}`, "red"));
					process.exit(1);
				}
				continue;
			}

			const content = readFileSync(shellConfig, "utf-8");

			if (!content.includes(SHELL_MARKER_START)) {
				if (!options.all) {
					console.log(colorize("Veil shell wrapper not found in config.", "yellow"));
					console.log(`Checked: ${shellConfig}`);
				}
				continue;
			}

			// Remove wrapper block
			const startIdx = content.indexOf(SHELL_MARKER_START);
			const endIdx = content.indexOf(SHELL_MARKER_END);

			if (startIdx === -1 || endIdx === -1) {
				console.error(colorize(`Malformed wrapper block in ${shellConfig}`, "red"));
				continue;
			}

			const before = content.slice(0, startIdx).trimEnd();
			const after = content.slice(endIdx + SHELL_MARKER_END.length).trimStart();
			const newContent = before + (after ? `\n\n${after}` : "\n");

			if (options.dryRun) {
				console.log(colorize(`Would remove from: ${shellConfig}`, "cyan"));
				removedAny = true;
				continue;
			}

			writeFileSync(shellConfig, newContent);
			console.log(colorize(`✓ Removed from: ${shellConfig}`, "green"));
			removedAny = true;
		}

		if (removedAny && !options.dryRun) {
			console.log();
			console.log("To apply changes, run:");
			console.log(colorize(`  source ${configs[0]}`, "cyan"));
			console.log();
			console.log("Or open a new terminal.");
		} else if (!removedAny) {
			console.log(colorize("No veil shell wrappers found to remove.", "yellow"));
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// mcp - Start the MCP server for IDE integration
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("mcp")
	.description("Start the Model Context Protocol server for IDE integration")
	.option("--http", "Use HTTP transport instead of stdio (for remote development)")
	.option("--port <port>", "Port for HTTP server (default: 3500)", "3500")
	.option("--host <host>", "Host for HTTP server (default: 0.0.0.0)", "0.0.0.0")
	.action(async (options: { http?: boolean; port?: string; host?: string }): Promise<void> => {
		try {
			if (options.http) {
				// HTTP transport for remote development
				const { startHttpServer } = await import("../mcp/http-server.js");
				const port = Number.parseInt(options.port ?? "3500", 10);
				const host = options.host ?? "0.0.0.0";
				await startHttpServer(port, host);
			} else {
				// Standard stdio transport
				const { startMcpServer } = await import("../mcp/index.js");
				await startMcpServer();
			}
		} catch (error) {
			console.error(colorize("Failed to start MCP server:", "red"));
			console.error(error);
			process.exit(1);
		}
	});

// ─────────────────────────────────────────────────────────────────────────────
// audit - Show recent audit/intercept logs (placeholder for future)
// ─────────────────────────────────────────────────────────────────────────────

program
	.command("audit")
	.description("Show recent audit logs (requires runtime integration)")
	.action((): void => {
		console.log(colorize("─ Audit Log ─", "cyan"));
		console.log();
		console.log("Audit logging requires runtime integration.");
		console.log("Add the audit manager to your Veil instance:");
		console.log();
		console.log(
			colorize("  import { AuditManager, MemoryStorageAdapter } from '@squadzero/veil';", "gray"),
		);
		console.log(colorize("  const audit = new AuditManager(new MemoryStorageAdapter());", "gray"));
		console.log(colorize("  audit.on('intercept', (event) => console.log(event));", "gray"));
	});

export function run(): void {
	program.parse(process.argv);
}

// Always run the CLI if this file is executed directly
run();
