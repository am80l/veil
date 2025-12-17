/**
 * CLI Rules Engine
 *
 * Handles interception and transformation of CLI commands
 */

import { evaluateRules } from "./matching";
import type { CliEngine, CliResult, CliRule } from "./types";

/**
 * Create a CLI rules engine
 */
export function createCliEngine(rules: CliRule[]): CliEngine {
	/**
	 * Check and potentially transform a CLI command
	 */
	function checkCommand(command: string): CliResult {
		const result = evaluateRules(command, rules);

		// No matching rule = allow by default
		if (!result) {
			return {
				ok: true,
				command,
			};
		}

		const { action, rule } = result;

		switch (action) {
			case "allow":
				return {
					ok: true,
					command,
				};

			case "deny": {
				const denyResult: CliResult = {
					ok: false,
					blocked: true,
					type: "cli",
					reason: "command_denied_by_policy",
					command,
				};
				if (rule.safeAlternatives) {
					denyResult.safeAlternatives = rule.safeAlternatives;
				}
				return denyResult;
			}

			case "rewrite":
				return {
					ok: true,
					command: rule.replacement ?? command,
				};

			case "mask": {
				// For CLI, mask is treated like deny with a placeholder
				const maskResult: CliResult = {
					ok: false,
					blocked: true,
					type: "cli",
					reason: "command_denied_by_policy",
					command,
				};
				if (rule.safeAlternatives) {
					maskResult.safeAlternatives = rule.safeAlternatives;
				}
				return maskResult;
			}
		}
	}

	/**
	 * Check if a command is allowed
	 */
	function isAllowed(command: string): boolean {
		const result = checkCommand(command);
		return result.ok;
	}

	/**
	 * Transform a command if rewrite rules apply
	 */
	function transform(command: string): string | null {
		const result = checkCommand(command);
		if (!result.ok) return null;
		return result.command ?? command;
	}

	return {
		checkCommand,
		isAllowed,
		transform,
	};
}
