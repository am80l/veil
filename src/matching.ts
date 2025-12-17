/**
 * Rule Matching Utilities
 *
 * Helper functions for matching rules against targets
 */

import type { BaseRule, RuleAction } from "./types";

/**
 * Check if a target matches a rule pattern
 */
export function matchesPattern(target: string, pattern: string | RegExp): boolean {
	if (typeof pattern === "string") {
		// Exact match or path contains
		return target === pattern || target.includes(pattern);
	}
	return pattern.test(target);
}

/**
 * Find the first matching rule for a target
 */
export function findMatchingRule<T extends BaseRule>(
	target: string,
	rules: T[]
): { rule: T; index: number } | null {
	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i];
		if (rule && matchesPattern(target, rule.match)) {
			return { rule, index: i };
		}
	}
	return null;
}

/**
 * Evaluate rules in order and return the action to take
 * Returns null if no rules match (defaults to allow)
 */
export function evaluateRules<T extends BaseRule>(
	target: string,
	rules: T[]
): { action: RuleAction; rule: T; policyRef: string } | null {
	const match = findMatchingRule(target, rules);
	if (!match) {
		return null;
	}
	const { rule, index } = match;
	const ruleType = getRuleTypeName(rule);
	return {
		action: rule.action,
		rule,
		policyRef: `${ruleType}[${index}]`,
	};
}

/**
 * Get a descriptive name for a rule type
 */
function getRuleTypeName(rule: BaseRule): string {
	// We use a simple heuristic based on properties
	if ("safeAlternatives" in rule) {
		return "cliRules";
	}
	// Default to fileRules as it's the most common
	return "rules";
}

/**
 * Apply a mask to a value
 */
export function applyMask(value: string, replacement?: string): string {
	if (replacement !== undefined) {
		return replacement;
	}
	// Default mask: show first and last char, mask middle
	if (value.length <= 4) {
		return "****";
	}
	return `${value[0]}${"*".repeat(Math.min(value.length - 2, 8))}${value[value.length - 1]}`;
}

/**
 * Generate a policy reference string
 */
export function generatePolicyRef(ruleType: string, index: number): string {
	return `${ruleType}[${index}]`;
}
