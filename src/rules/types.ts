/**
 * Rule System Types
 */

import type { CliRule, EnvRule, FileRule } from "../types";

/**
 * Supported platforms
 */
export type Platform = "windows" | "darwin" | "linux" | "all";

/**
 * Rule categories
 */
export type RuleCategory =
	| "security"
	| "privacy"
	| "filesystem"
	| "credentials"
	| "destructive"
	| "network"
	| "system"
	| "tooling";

/**
 * Rule severity levels
 */
export type RuleSeverity = "error" | "warn" | "off";

/**
 * Rule enforcement mode
 * - strict: Block access completely with a custom message
 * - passive: Allow access but inject additional context/guidance
 */
export type RuleMode = "strict" | "passive";

/**
 * Modal rule options - used when a rule supports both strict and passive modes
 */
export interface ModalRuleOptions {
	/** Custom message to display when rule is triggered */
	message?: string;
	/** Additional context to inject in passive mode */
	context?: string;
}

/**
 * A named rule definition
 */
export interface VeilRule {
	/** Unique rule ID (e.g., "fs/no-delete-root") */
	id: string;
	/** Human-readable description */
	description: string;
	/** Rule category */
	category: RuleCategory;
	/** Applicable platforms */
	platforms: Platform[];
	/** Default severity */
	defaultSeverity: RuleSeverity;
	/** Whether this rule supports modal (strict/passive) configuration */
	supportsMode?: boolean;
	/** Default mode if rule supports it */
	defaultMode?: RuleMode;
	/** The actual rule(s) this maps to */
	fileRules?: FileRule[];
	envRules?: EnvRule[];
	cliRules?: CliRule[];
	/** Factory function for modal rules - generates rules based on mode */
	createRules?: (
		mode: RuleMode,
		options?: ModalRuleOptions,
	) => {
		fileRules?: FileRule[];
		envRules?: EnvRule[];
		cliRules?: CliRule[];
	};
}

/**
 * Rule configuration - severity, or tuple with options
 */
export type RuleConfig = RuleSeverity | [RuleSeverity, ModalRuleConfig];

/**
 * Modal rule configuration options
 */
export interface ModalRuleConfig {
	/** Enforcement mode */
	mode?: RuleMode;
	/** Custom message for strict mode */
	message?: string;
	/** Additional context for passive mode */
	context?: string;
}

/**
 * Rules configuration object
 */
export type RulesConfig = Record<string, RuleConfig>;

/**
 * A rule pack is a collection of rules
 */
export interface RulePack {
	/** Pack name */
	name: string;
	/** Description */
	description: string;
	/** Rules included in this pack */
	rules: string[];
}
