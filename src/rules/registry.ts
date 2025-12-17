/**
 * Rule Registry
 *
 * Central registry for all Veil rules
 */

import type { VeilConfig } from "../types";
import type {
	ModalRuleConfig,
	ModalRuleOptions,
	Platform,
	RuleConfig,
	RulesConfig,
	VeilRule,
} from "./types";

/**
 * All registered rules
 */
const ruleRegistry = new Map<string, VeilRule>();

/**
 * Track if platform rules are registered
 */
let platformRulesRegistered = false;

/**
 * Clear the registry (for testing)
 */
export function clearRegistry(): void {
	ruleRegistry.clear();
	platformRulesRegistered = false;
}

/**
 * Check if platform rules are registered
 */
export function arePlatformRulesRegistered(): boolean {
	return platformRulesRegistered;
}

/**
 * Mark platform rules as registered
 */
export function markPlatformRulesRegistered(): void {
	platformRulesRegistered = true;
}

/**
 * Register a rule
 */
export function registerRule(rule: VeilRule): void {
	if (ruleRegistry.has(rule.id)) {
		// Skip silently if already registered (idempotent)
		return;
	}
	ruleRegistry.set(rule.id, rule);
}

/**
 * Register multiple rules
 */
export function registerRules(rules: VeilRule[]): void {
	for (const rule of rules) {
		registerRule(rule);
	}
}

/**
 * Get a rule by ID
 */
export function getRule(id: string): VeilRule | undefined {
	return ruleRegistry.get(id);
}

/**
 * Get all registered rules
 */
export function getAllRules(): VeilRule[] {
	return [...ruleRegistry.values()];
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string): VeilRule[] {
	return getAllRules().filter((r) => r.category === category);
}

/**
 * Get rules by platform
 */
export function getRulesByPlatform(platform: Platform): VeilRule[] {
	return getAllRules().filter((r) => r.platforms.includes(platform) || r.platforms.includes("all"));
}

/**
 * Detect current platform
 */
export function detectPlatform(): Platform {
	switch (process.platform) {
		case "win32":
			return "windows";
		case "darwin":
			return "darwin";
		case "linux":
			return "linux";
		default:
			return "linux"; // Default to linux for unknown platforms
	}
}

/**
 * Convert severity to rule action
 */
function severityToEnabled(severity: RuleConfig): boolean {
	if (typeof severity === "string") {
		return severity !== "off";
	}
	return severity[0] !== "off";
}

/**
 * Extract modal config from rule config
 */
function extractModalConfig(ruleConfig: RuleConfig): ModalRuleConfig | undefined {
	if (typeof ruleConfig === "string") {
		return undefined;
	}
	return ruleConfig[1];
}

/**
 * Build a VeilConfig from rules configuration
 */
export function buildConfigFromRules(rulesConfig: RulesConfig, platform?: Platform): VeilConfig {
	const targetPlatform = platform ?? detectPlatform();
	const config: VeilConfig = {
		fileRules: [],
		envRules: [],
		cliRules: [],
	};

	for (const [ruleId, ruleConfig] of Object.entries(rulesConfig)) {
		if (!severityToEnabled(ruleConfig)) {
			continue;
		}

		const rule = getRule(ruleId);
		if (!rule) {
			console.warn(`Unknown rule: ${ruleId}`);
			continue;
		}

		// Check platform compatibility
		if (!rule.platforms.includes("all") && !rule.platforms.includes(targetPlatform)) {
			continue;
		}

		// Handle modal rules (rules that support strict/passive modes)
		if (rule.supportsMode && rule.createRules) {
			const modalConfig = extractModalConfig(ruleConfig);
			const mode = modalConfig?.mode ?? rule.defaultMode ?? "passive";

			// Build options object only with defined values (exactOptionalPropertyTypes)
			const options: ModalRuleOptions = {};
			if (modalConfig?.message !== undefined) {
				options.message = modalConfig.message;
			}
			if (modalConfig?.context !== undefined) {
				options.context = modalConfig.context;
			}

			const generatedRules = rule.createRules(mode, options);

			if (generatedRules.fileRules) {
				config.fileRules?.push(...generatedRules.fileRules);
			}
			if (generatedRules.envRules) {
				config.envRules?.push(...generatedRules.envRules);
			}
			if (generatedRules.cliRules) {
				config.cliRules?.push(...generatedRules.cliRules);
			}
			continue;
		}

		// Add static rules
		if (rule.fileRules) {
			config.fileRules?.push(...rule.fileRules);
		}
		if (rule.envRules) {
			config.envRules?.push(...rule.envRules);
		}
		if (rule.cliRules) {
			config.cliRules?.push(...rule.cliRules);
		}
	}

	return config;
}

/**
 * Get recommended rules for a platform
 */
export function getRecommendedRules(platform?: Platform): RulesConfig {
	const targetPlatform = platform ?? detectPlatform();
	const config: RulesConfig = {};

	for (const rule of getRulesByPlatform(targetPlatform)) {
		if (rule.defaultSeverity !== "off") {
			config[rule.id] = rule.defaultSeverity;
		}
	}

	return config;
}

/**
 * Create a config extending another config
 */
export function extendRules(base: RulesConfig, overrides: RulesConfig): RulesConfig {
	return { ...base, ...overrides };
}
