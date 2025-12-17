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

// Builder API
export { VeilBuilder, veilBuilder } from "./builder";

// Plugin System
export {
	PluginManager,
	createLoggingPlugin,
	createMetricsPlugin,
} from "./plugins";
export type {
	VeilPlugin,
	FileHookContext,
	EnvHookContext,
	CliHookContext,
	HookContext,
	BeforeHookResult,
} from "./plugins";

// Audit System
export {
	AuditManager,
	MemoryStorageAdapter,
	createConsoleStorageAdapter,
} from "./audit";
export type {
	AuditEvent,
	AuditEventType,
	AuditEventListener,
	AuditStorageAdapter,
	AuditQueryCriteria,
} from "./audit";

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
	GuardResult,
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

// Presets and helpers
export {
	// Individual rule sets
	COMMON_HIDDEN_DIRS,
	SENSITIVE_FILES,
	SENSITIVE_ENV_VARS,
	DANGEROUS_COMMANDS,
	CREDENTIAL_LEAK_COMMANDS,
	// Complete presets
	PRESET_RECOMMENDED,
	PRESET_STRICT,
	PRESET_MINIMAL,
	PRESET_CI,
	// Helpers
	mergeConfigs,
} from "./presets";

// Rules system (ESLint-style named rules)
export * as rules from "./rules";
export type {
	VeilRule,
	RuleCategory,
	RuleSeverity,
	RuleConfig,
	RulesConfig,
	RulePack,
	Platform,
	RuleMode,
	ModalRuleOptions,
	ModalRuleConfig,
} from "./rules/types";
export {
	registerRule,
	registerRules,
	getRule,
	getAllRules,
	getRulesByCategory,
	getRulesByPlatform,
	detectPlatform,
	buildConfigFromRules,
	getRecommendedRules,
	extendRules,
	clearRegistry,
	ensureRulesRegistered,
} from "./rules/registry";
export {
	windowsRules,
	darwinRules,
	linuxRules,
	crossPlatformRules,
	registerPlatformRules,
} from "./rules/platform";
export {
	RULE_PACKS,
	fromPacks,
	fromCategory,
	recommended,
	strict,
	listRules,
	listPacks,
} from "./rules/categories";
export {
	modalRules,
	wranglerRule,
	dockerRule,
	terraformRule,
	kubectlRule,
	awsCliRule,
	npmRule,
	gitRule,
	registerModalRules,
	getDefaultContext,
	getDefaultStrictMessage,
} from "./rules/modal";
