/**
 * Veil
 *
 * A TypeScript library for selective context access, visibility control
 * & safety enforcement for LLMs.
 *
 * @example
 * ```ts
 * import { createVeil } from 'veil';
 *
 * const veil = createVeil({
 *   fileRules: [
 *     { match: 'node_modules', action: 'deny' },
 *     { match: /secrets/, action: 'deny' }
 *   ],
 *   envRules: [
 *     { match: /^AWS_/, action: 'mask' },
 *     { match: 'DATABASE_URL', action: 'deny' }
 *   ],
 *   cliRules: [
 *     { match: /^rm -rf/, action: 'deny' }
 *   ]
 * });
 *
 * // Check file access
 * const fileResult = veil.checkFile('/path/to/secrets/config.json');
 * if (!fileResult.ok) {
 *   console.log('Blocked:', fileResult.reason);
 * }
 *
 * // Get masked env variable
 * const envResult = veil.getEnv('AWS_SECRET_KEY');
 *
 * // Check CLI command
 * const cliResult = veil.checkCommand('rm -rf /');
 * if (!cliResult.ok) {
 *   console.log('Dangerous command blocked');
 * }
 * ```
 */

// Main factory
export { createVeil } from "./veil";

// Types
export type {
	// Configuration
	VeilConfig,
	VeilInjectors,
	// Rules
	BaseRule,
	FileRule,
	EnvRule,
	CliRule,
	RuleAction,
	// Results
	VeilResult,
	VeilSuccess,
	VeilBlocked,
	BlockReason,
	BlockDetails,
	FileResult,
	DirectoryResult,
	EnvResult,
	CliResult,
	// Context
	VeilContext,
	InterceptRecord,
	SyntheticValue,
	// Policy
	PolicyLayer,
	ScopedPolicy,
	// Instance
	Veil,
} from "./types";

// Utilities (for advanced users)
export { matchesPattern, findMatchingRule, evaluateRules, applyMask } from "./matching";
