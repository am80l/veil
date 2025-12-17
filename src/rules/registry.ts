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
 * Track if all rules are registered
 */
let allRulesRegistered = false;

/**
 * Clear the registry (for testing)
 */
export function clearRegistry(): void {
	ruleRegistry.clear();
	allRulesRegistered = false;
}

/**
 * Check if all rules are registered
 */
export function areRulesRegistered(): boolean {
	return allRulesRegistered;
}

/**
 * Registration callbacks for lazy initialization
 */
let platformRegistrar: (() => void) | undefined;
let modalRegistrar: (() => void) | undefined;

/**
 * Set the platform rules registrar (called by platform.ts on import)
 */
export function setPlatformRegistrar(registrar: () => void): void {
	platformRegistrar = registrar;
}

/**
 * Set the modal rules registrar (called by modal.ts on import)
 */
export function setModalRegistrar(registrar: () => void): void {
	modalRegistrar = registrar;
}

/**
 * Ensure all built-in rules are registered (auto-registration)
 * This is called automatically when needed - users don't need to call this
 */
export function ensureRulesRegistered(): void {
	if (allRulesRegistered) {
		return;
	}
	// Call registrars if they've been set
	platformRegistrar?.();
	modalRegistrar?.();
	allRulesRegistered = true;
}

/**
 * @deprecated Use ensureRulesRegistered() or let Veil auto-register
 */
export function markPlatformRulesRegistered(): void {
	allRulesRegistered = true;
}

/**
 * @deprecated Use areRulesRegistered() instead
 */
export function arePlatformRulesRegistered(): boolean {
	return allRulesRegistered;
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
 * Get a rule by ID (auto-registers if needed)
 */
export function getRule(id: string): VeilRule | undefined {
	ensureRulesRegistered();
	return ruleRegistry.get(id);
}

/**
 * Get all registered rules (auto-registers if needed)
 */
export function getAllRules(): VeilRule[] {
	ensureRulesRegistered();
	return [...ruleRegistry.values()];
}

/**
 * Get rules by category (auto-registers if needed)
 */
export function getRulesByCategory(category: string): VeilRule[] {
	ensureRulesRegistered();
	return getAllRules().filter((r) => r.category === category);
}

/**
 * Get rules by platform (auto-registers if needed)
 */
export function getRulesByPlatform(platform: Platform): VeilRule[] {
	ensureRulesRegistered();
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
function severityToEnabled(ruleConfig: RuleConfig): boolean {
	// Direct ModalRuleConfig means enabled
	if (typeof ruleConfig === "object" && !Array.isArray(ruleConfig)) {
		return true;
	}
	if (typeof ruleConfig === "string") {
		return ruleConfig !== "off";
	}
	return ruleConfig[0] !== "off";
}

/**
 * Extract modal config from rule config
 */
function extractModalConfig(ruleConfig: RuleConfig): ModalRuleConfig | undefined {
	if (typeof ruleConfig === "string") {
		return undefined;
	}
	if (Array.isArray(ruleConfig)) {
		return ruleConfig[1];
	}
	// Direct ModalRuleConfig object
	return ruleConfig;
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
