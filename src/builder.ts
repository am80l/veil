/**
 * Veil Builder - Fluent API for constructing Veil instances
 *
 * Provides a chainable, ergonomic way to configure Veil
 */

import { fromPacks } from "./rules/categories";
import { ensureRulesRegistered } from "./rules/registry";
import { buildConfigFromRules } from "./rules/registry";
import type { ModalRuleConfig, RuleMode, RulesConfig } from "./rules/types";
import type { CliRule, EnvRule, FileRule, Veil, VeilConfig, VeilInjectors } from "./types";
import { createVeil } from "./veil";

/**
 * Fluent builder for creating Veil instances
 *
 * @example
 * ```ts
 * const veil = new VeilBuilder()
 *   .usePack('security:recommended')
 *   .useModal('cli/wrangler', { mode: 'passive' })
 *   .denyFile(/\.env/)
 *   .denyEnv(/^AWS_/)
 *   .denyCommand(/^rm -rf/)
 *   .build();
 * ```
 */
export class VeilBuilder {
	private fileRules: FileRule[] = [];
	private envRules: EnvRule[] = [];
	private cliRules: CliRule[] = [];
	private rulesConfig: RulesConfig = {};
	private injectors?: VeilInjectors;
	private packs: string[] = [];

	/**
	 * Add a rule pack (like ESLint's extends)
	 */
	usePack(packName: string): this {
		this.packs.push(packName);
		return this;
	}

	/**
	 * Add multiple rule packs
	 */
	usePacks(...packNames: string[]): this {
		this.packs.push(...packNames);
		return this;
	}

	/**
	 * Configure a modal rule (e.g., wrangler, docker, terraform)
	 */
	useModal(ruleId: string, options: { mode: RuleMode; message?: string; context?: string }): this {
		const config: ModalRuleConfig = { mode: options.mode };
		if (options.message !== undefined) {
			config.message = options.message;
		}
		if (options.context !== undefined) {
			config.context = options.context;
		}
		this.rulesConfig[ruleId] = config;
		return this;
	}

	/**
	 * Enable a named rule
	 */
	useRule(ruleId: string, severity: "error" | "warn" = "error"): this {
		this.rulesConfig[ruleId] = severity;
		return this;
	}

	/**
	 * Disable a named rule
	 */
	disableRule(ruleId: string): this {
		this.rulesConfig[ruleId] = "off";
		return this;
	}

	/**
	 * Add a file deny rule
	 */
	denyFile(pattern: string | RegExp, reason?: string): this {
		const rule: FileRule = { match: pattern, action: "deny" };
		if (reason !== undefined) {
			rule.reason = reason;
		}
		this.fileRules.push(rule);
		return this;
	}

	/**
	 * Add a file allow rule
	 */
	allowFile(pattern: string | RegExp): this {
		this.fileRules.push({ match: pattern, action: "allow" });
		return this;
	}

	/**
	 * Add a file mask rule
	 */
	maskFile(pattern: string | RegExp, replacement?: string): this {
		const rule: FileRule = { match: pattern, action: "mask" };
		if (replacement !== undefined) {
			rule.replacement = replacement;
		}
		this.fileRules.push(rule);
		return this;
	}

	/**
	 * Add an environment variable deny rule
	 */
	denyEnv(pattern: string | RegExp, reason?: string): this {
		const rule: EnvRule = { match: pattern, action: "deny" };
		if (reason !== undefined) {
			rule.reason = reason;
		}
		this.envRules.push(rule);
		return this;
	}

	/**
	 * Add an environment variable mask rule
	 */
	maskEnv(pattern: string | RegExp, replacement?: string): this {
		const rule: EnvRule = { match: pattern, action: "mask" };
		if (replacement !== undefined) {
			rule.replacement = replacement;
		}
		this.envRules.push(rule);
		return this;
	}

	/**
	 * Add an environment variable allow rule
	 */
	allowEnv(pattern: string | RegExp): this {
		this.envRules.push({ match: pattern, action: "allow" });
		return this;
	}

	/**
	 * Add a CLI command deny rule
	 */
	denyCommand(
		pattern: string | RegExp,
		options?: { reason?: string; safeAlternatives?: string[] },
	): this {
		const rule: CliRule = { match: pattern, action: "deny" };
		if (options?.reason !== undefined) {
			rule.reason = options.reason;
		}
		if (options?.safeAlternatives !== undefined) {
			rule.safeAlternatives = options.safeAlternatives;
		}
		this.cliRules.push(rule);
		return this;
	}

	/**
	 * Add a CLI command rewrite rule
	 */
	rewriteCommand(pattern: string | RegExp, replacement: string): this {
		this.cliRules.push({ match: pattern, action: "rewrite", replacement });
		return this;
	}

	/**
	 * Add a CLI command allow rule
	 */
	allowCommand(pattern: string | RegExp): this {
		this.cliRules.push({ match: pattern, action: "allow" });
		return this;
	}

	/**
	 * Set custom injectors for synthetic context
	 */
	withInjectors(injectors: VeilInjectors): this {
		this.injectors = injectors;
		return this;
	}

	/**
	 * Build the Veil instance
	 */
	build(): Veil {
		// Ensure all rules are registered
		ensureRulesRegistered();

		// Start with pack-based config
		const config: VeilConfig = {
			fileRules: [],
			envRules: [],
			cliRules: [],
		};

		// Apply packs
		if (this.packs.length > 0) {
			const packRules = fromPacks(...this.packs);
			const packConfig = buildConfigFromRules(packRules);
			config.fileRules = packConfig.fileRules ?? [];
			config.envRules = packConfig.envRules ?? [];
			config.cliRules = packConfig.cliRules ?? [];
		}

		// Apply individual rules config
		if (Object.keys(this.rulesConfig).length > 0) {
			const rulesBasedConfig = buildConfigFromRules(this.rulesConfig);
			config.fileRules?.push(...(rulesBasedConfig.fileRules ?? []));
			config.envRules?.push(...(rulesBasedConfig.envRules ?? []));
			config.cliRules?.push(...(rulesBasedConfig.cliRules ?? []));
		}

		// Apply explicit rules (these take priority - added last)
		config.fileRules?.push(...this.fileRules);
		config.envRules?.push(...this.envRules);
		config.cliRules?.push(...this.cliRules);

		// Add injectors
		if (this.injectors !== undefined) {
			config.injectors = this.injectors;
		}

		return createVeil(config);
	}
}

/**
 * Create a new VeilBuilder instance
 *
 * @example
 * ```ts
 * const veil = veil()
 *   .usePack('security:recommended')
 *   .denyFile(/\.env/)
 *   .build();
 * ```
 */
export function veilBuilder(): VeilBuilder {
	return new VeilBuilder();
}
