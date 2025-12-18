/**
 * Environment Rules Engine
 *
 * Handles visibility control for environment variables
 */

import { applyMask, evaluateRules } from "./matching";
import type {
	BlockDetails,
	EnvEngine,
	EnvResult,
	EnvRule,
	VeilBlocked,
	VeilInjectors,
	VeilSuccess,
} from "./types";

// Type-safe access to process.env
declare const process: { env: Record<string, string | undefined> };

/**
 * Create an environment rules engine
 */
export function createEnvEngine(rules: EnvRule[], injectors?: VeilInjectors): EnvEngine {
	/**
	 * Get an environment variable with rules applied
	 */
	function getEnv(key: string): EnvResult {
		// First check injectors for custom handling
		if (injectors?.env) {
			const injected = injectors.env(key);
			if (injected !== null) {
				return {
					ok: true,
					value: injected,
				};
			}
		}

		const result = evaluateRules(key, rules);

		// No matching rule = allow by default (pass through real value)
		if (!result) {
			return {
				ok: true,
				value: process.env[key],
			};
		}

		const { action, rule, policyRef } = result;
		const realValue = process.env[key];

		switch (action) {
			case "allow": {
				const allowResult: EnvResult = { ok: true, value: realValue };
				// Surface context from passive mode rules
				if (rule.reason) {
					allowResult.context = rule.reason;
				}
				return allowResult;
			}

			case "deny":
				return createEnvBlockedResult(
					key,
					rule.reason ?? "env_denied_by_policy",
					policyRef,
					action,
				);

			case "mask":
				if (realValue === undefined) {
					return { ok: true, value: undefined };
				}
				return {
					ok: true,
					value: applyMask(realValue, rule.replacement),
				} as VeilSuccess<string>;

			case "rewrite":
				return {
					ok: true,
					value: rule.replacement ?? "",
				};
		}
	}

	/**
	 * Get all visible environment variables with rules applied
	 */
	function getVisibleEnv(): Record<string, string> {
		const visibleEnv: Record<string, string> = {};

		for (const [key, value] of Object.entries(process.env)) {
			if (value === undefined) continue;

			const result = evaluateRules(key, rules);

			if (!result) {
				// No rule = allow
				visibleEnv[key] = value;
				continue;
			}

			const { action, rule } = result;

			switch (action) {
				case "allow":
					visibleEnv[key] = value;
					break;

				case "mask":
					visibleEnv[key] = applyMask(value, rule.replacement);
					break;

				case "rewrite":
					visibleEnv[key] = rule.replacement ?? "";
					break;

				case "deny":
					// Excluded from visible env
					break;
			}
		}

		return visibleEnv;
	}

	/**
	 * Check if an env key should be visible
	 */
	function isVisible(key: string): boolean {
		const result = evaluateRules(key, rules);
		if (!result) return true;
		return result.action !== "deny";
	}

	return {
		getEnv,
		getVisibleEnv,
		isVisible,
	};
}

/**
 * Create a blocked result for env operations
 */
function createEnvBlockedResult(
	target: string,
	reason: string,
	policy: string,
	action: "deny" | "mask",
): VeilBlocked {
	const details: BlockDetails = {
		target,
		policy,
		action,
	};

	return {
		ok: false,
		blocked: true,
		reason,
		details,
	};
}
