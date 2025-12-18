/**
 * File Rules Engine
 *
 * Handles visibility control for files and directories
 */

import { evaluateRules } from "./matching";
import type {
	BlockDetails,
	DirectoryResult,
	FileEngine,
	FileResult,
	FileRule,
	VeilBlocked,
	VeilInjectors,
	VeilSuccess,
} from "./types";

/**
 * Create a file rules engine
 */
export function createFileEngine(rules: FileRule[], injectors?: VeilInjectors): FileEngine {
	/**
	 * Check if a file path is accessible
	 */
	function checkFile(path: string): FileResult | VeilSuccess<true> {
		// First check injectors for custom handling
		if (injectors?.files) {
			const injected = injectors.files(path);
			if (injected !== null) {
				return {
					ok: true,
					value: injected,
				};
			}
		}

		const result = evaluateRules(path, rules);

		// No matching rule = allow by default
		if (!result) {
			return { ok: true, value: true };
		}

		const { action, rule, policyRef } = result;

		switch (action) {
			case "allow":
				return { ok: true, value: true };

			case "deny":
				return createBlockedResult(path, rule.reason ?? "file_hidden_by_policy", policyRef, action);

			case "mask":
				return createBlockedResult(
					path,
					"file_hidden_by_policy",
					policyRef,
					action,
					rule.replacement ?? "hidden_by_policy",
				);

			case "rewrite":
				if (rule.replacement !== undefined) {
					return { ok: true, value: rule.replacement };
				}
				return createBlockedResult(path, "file_hidden_by_policy", policyRef, action);
		}
	}

	/**
	 * Check if a directory path is accessible
	 */
	function checkDirectory(path: string): DirectoryResult | VeilSuccess<true> {
		// First check injectors for custom handling
		if (injectors?.directories) {
			const injected = injectors.directories(path);
			if (injected !== null) {
				return {
					ok: true,
					value: injected,
				};
			}
		}

		const result = evaluateRules(path, rules);

		// No matching rule = allow by default
		if (!result) {
			return { ok: true, value: true };
		}

		const { action, rule, policyRef } = result;

		switch (action) {
			case "allow":
				return { ok: true, value: true };

			case "deny":
				return createBlockedResult(
					path,
					rule.reason ?? "directory_hidden_by_policy",
					policyRef,
					action,
				);

			case "mask":
				return createBlockedResult(
					path,
					"directory_hidden_by_policy",
					policyRef,
					action,
					rule.replacement ?? "hidden_by_policy",
				);

			case "rewrite":
				// For directories, rewrite returns an empty array or custom list
				return { ok: true, value: [] };
		}
	}

	/**
	 * Filter a list of paths according to rules
	 */
	function filterPaths(paths: string[]): string[] {
		return paths.filter((path) => {
			const result = evaluateRules(path, rules);
			if (!result) return true; // No rule = allow
			return result.action === "allow";
		});
	}

	/**
	 * Check if a path should be visible
	 */
	function isVisible(path: string): boolean {
		const result = evaluateRules(path, rules);
		if (!result) return true;
		return result.action === "allow";
	}

	return {
		checkFile,
		checkDirectory,
		filterPaths,
		isVisible,
	};
}

/**
 * Create a blocked result object
 */
function createBlockedResult(
	target: string,
	reason: string,
	policy: string,
	action: "deny" | "mask" | "rewrite",
	replacement?: string,
): VeilBlocked {
	const details: BlockDetails = {
		target,
		policy,
		action,
	};

	if (replacement !== undefined) {
		details.replacement = replacement;
	}

	return {
		ok: false,
		blocked: true,
		reason,
		details,
	};
}
