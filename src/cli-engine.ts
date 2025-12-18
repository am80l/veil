/**
 * CLI Rules Engine
 *
 * Handles interception and transformation of CLI commands
 */

import { evaluateRules } from "./matching";
import { type NormalizeOptions, describeNormalization, normalizeCommand } from "./normalize";
import type { BypassProtectionOptions, CliEngine, CliResult, CliRule } from "./types";

/**
 * Options for creating a CLI engine
 */
export interface CliEngineOptions {
	/**
	 * Enable bypass protection via command normalization.
	 * - true: Enable all normalization (default)
	 * - false: Disable normalization
	 * - object: Fine-grained control over normalization options
	 */
	bypassProtection?: boolean | BypassProtectionOptions;
}

/**
 * Convert bypassProtection config to NormalizeOptions
 */
function getBypassOptions(
	config: boolean | BypassProtectionOptions | undefined,
): NormalizeOptions | null {
	// Default: enabled with all options
	if (config === undefined || config === true) {
		return {
			stripPaths: true,
			unwrapShells: true,
			unwrapEval: true,
			stripPackageRunners: true,
		};
	}

	// Explicitly disabled
	if (config === false) {
		return null;
	}

	// Custom options
	return {
		stripPaths: config.stripPaths ?? true,
		unwrapShells: config.unwrapShells ?? true,
		unwrapEval: config.unwrapEval ?? true,
		stripPackageRunners: config.stripPackageRunners ?? true,
	};
}

/**
 * Create a CLI rules engine
 */
export function createCliEngine(rules: CliRule[], options: CliEngineOptions = {}): CliEngine {
	const bypassOptions = getBypassOptions(options.bypassProtection);

	/**
	 * Check and potentially transform a CLI command
	 */
	function checkCommand(command: string): CliResult {
		// Get command variants to check (original + normalized versions)
		const variants = bypassOptions ? normalizeCommand(command, bypassOptions) : [command.trim()];

		// Check each variant against rules - first deny wins
		for (const variant of variants) {
			const result = evaluateRules(variant, rules);

			if (result) {
				const { action, rule } = result;

				// Track if this was caught via normalization
				const wasNormalized = variant !== command.trim();
				const normalizationNote = wasNormalized ? describeNormalization(command, variant) : null;

				switch (action) {
					case "allow": {
						const allowResult: CliResult = {
							ok: true,
							command,
						};
						if (rule.reason) {
							allowResult.context = rule.reason;
						}
						return allowResult;
					}

					case "deny": {
						let reason = rule.reason ?? "command_denied_by_policy";
						// Add bypass detection note
						if (normalizationNote) {
							reason = `${reason}\n\n⚠️ Bypass attempt detected: ${normalizationNote}`;
						}

						const denyResult: CliResult = {
							ok: false,
							blocked: true,
							type: "cli",
							reason,
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
						let reason = rule.reason ?? "command_denied_by_policy";
						if (normalizationNote) {
							reason = `${reason}\n\n⚠️ Bypass attempt detected: ${normalizationNote}`;
						}

						const maskResult: CliResult = {
							ok: false,
							blocked: true,
							type: "cli",
							reason,
							command,
						};
						if (rule.safeAlternatives) {
							maskResult.safeAlternatives = rule.safeAlternatives;
						}
						return maskResult;
					}
				}
			}
		}

		// No matching rule = allow by default
		return {
			ok: true,
			command,
		};
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
