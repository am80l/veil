/**
 * Veil Core Types
 *
 * Type definitions for visibility rules, policies, and context management
 */

// ============================================================================
// Rule Actions
// ============================================================================

/**
 * Available actions for visibility rules
 */
export type RuleAction = "allow" | "deny" | "mask" | "rewrite";

// ============================================================================
// Base Rule Type
// ============================================================================

/**
 * Base visibility rule that all specific rules extend
 */
export interface BaseRule {
	/** Pattern to match against - string for exact match, RegExp for pattern */
	match: string | RegExp;
	/** Action to take when pattern matches */
	action: RuleAction;
	/** Replacement value for mask/rewrite actions */
	replacement?: string;
	/** Human-readable reason for this rule */
	reason?: string;
}

/**
 * Rule for controlling file and directory visibility
 */
export interface FileRule extends BaseRule {}

/**
 * Rule for controlling environment variable access
 */
export interface EnvRule extends BaseRule {}

/**
 * Rule for controlling CLI command execution
 */
export interface CliRule extends BaseRule {
	/** Safe alternative commands to suggest when blocking */
	safeAlternatives?: string[];
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Veil configuration options
 */
export interface VeilConfig {
	/** Rules for file/directory visibility */
	fileRules?: FileRule[];
	/** Rules for environment variable access */
	envRules?: EnvRule[];
	/** Rules for CLI command interception */
	cliRules?: CliRule[];
	/** Custom context injectors */
	injectors?: VeilInjectors;
}

/**
 * Custom injectors for synthetic context
 */
export interface VeilInjectors {
	/** Custom file content injector */
	files?: (path: string) => string | null;
	/** Custom env value injector */
	env?: (key: string) => string | null;
	/** Custom directory listing injector */
	directories?: (path: string) => string[] | null;
}

// ============================================================================
// Results & Responses
// ============================================================================

/**
 * Base result for all Veil operations
 */
export interface VeilResult {
	ok: boolean;
}

/**
 * Successful operation result
 */
export interface VeilSuccess<T = unknown> extends VeilResult {
	ok: true;
	value: T;
}

/**
 * Blocked operation result
 */
export interface VeilBlocked extends VeilResult {
	ok: false;
	blocked: true;
	reason: BlockReason;
	details: BlockDetails;
}

/**
 * Reasons for blocking an operation
 */
export type BlockReason =
	| "directory_hidden_by_policy"
	| "file_hidden_by_policy"
	| "env_denied_by_policy"
	| "env_masked_by_policy"
	| "command_denied_by_policy"
	| "command_rewritten_by_policy";

/**
 * Details about why an operation was blocked
 */
export interface BlockDetails {
	/** The path, key, or command that was blocked */
	target: string;
	/** Reference to the policy rule that caused the block */
	policy: string;
	/** The action that was applied */
	action: RuleAction;
	/** Replacement value if applicable */
	replacement?: string;
	/** Safe alternatives if applicable */
	safeAlternatives?: string[];
}

/**
 * Result type for file operations
 */
export type FileResult = VeilSuccess<string> | VeilBlocked;

/**
 * Result type for directory listing operations
 */
export type DirectoryResult = VeilSuccess<string[]> | VeilBlocked;

/**
 * Result type for environment variable operations
 */
export type EnvResult = VeilSuccess<string | undefined> | VeilBlocked;

/**
 * Result type for CLI command operations
 */
export interface CliResult extends VeilResult {
	ok: boolean;
	blocked?: boolean;
	type?: "cli";
	reason?: BlockReason;
	command?: string;
	safeAlternatives?: string[];
}

// ============================================================================
// Context
// ============================================================================

/**
 * Intercepted call record for audit purposes
 */
export interface InterceptRecord {
	type: "file" | "env" | "cli" | "directory";
	target: string;
	action: RuleAction;
	timestamp: number;
	policy: string;
}

/**
 * The curated context object that represents what the LLM sees
 */
export interface VeilContext {
	/** List of visible file paths */
	visibleFiles: string[];
	/** List of visible directory paths */
	visibleDirectories: string[];
	/** Visible environment variables (after filtering/masking) */
	visibleEnv: Record<string, string>;
	/** Record of all intercepted calls */
	interceptedCalls: InterceptRecord[];
}

/**
 * Synthetic/curated replacement value
 */
export interface SyntheticValue {
	synthetic: true;
	origin: "veil:rewrite" | "veil:mask" | "veil:injector";
	value: string;
}

// ============================================================================
// Policy Layers
// ============================================================================

/**
 * Policy layer for cascading rule evaluation
 */
export type PolicyLayer = "global" | "session" | "call";

/**
 * Scoped policy configuration
 */
export interface ScopedPolicy {
	layer: PolicyLayer;
	fileRules?: FileRule[];
	envRules?: EnvRule[];
	cliRules?: CliRule[];
}

// ============================================================================
// Veil Instance
// ============================================================================

/**
 * Main Veil instance interface
 */
export interface Veil {
	/**
	 * Check if a file path is visible according to current rules
	 */
	checkFile(path: string): FileResult | VeilSuccess<true>;

	/**
	 * Check if a directory path is visible according to current rules
	 */
	checkDirectory(path: string): DirectoryResult | VeilSuccess<true>;

	/**
	 * Filter a list of files/directories according to current rules
	 */
	filterPaths(paths: string[]): string[];

	/**
	 * Get an environment variable with rules applied
	 */
	getEnv(key: string): EnvResult;

	/**
	 * Get all visible environment variables
	 */
	getVisibleEnv(): Record<string, string>;

	/**
	 * Check/transform a CLI command according to rules
	 */
	checkCommand(command: string): CliResult;

	/**
	 * Execute a guarded operation
	 */
	guard<T>(operation: () => T | Promise<T>): Promise<T>;

	/**
	 * Create a scoped instance with additional rules
	 */
	scope(policy: Omit<ScopedPolicy, "layer">): Veil;

	/**
	 * Get the current veil context (what the LLM sees)
	 */
	getContext(): VeilContext;

	/**
	 * Get all intercepted calls
	 */
	getInterceptedCalls(): InterceptRecord[];

	/**
	 * Clear intercepted calls log
	 */
	clearInterceptedCalls(): void;
}

// ============================================================================
// Engine Interfaces
// ============================================================================

/**
 * File engine interface
 */
export interface FileEngine {
	checkFile(path: string): FileResult | VeilSuccess<true>;
	checkDirectory(path: string): DirectoryResult | VeilSuccess<true>;
	filterPaths(paths: string[]): string[];
	isVisible(path: string): boolean;
}

/**
 * Environment engine interface
 */
export interface EnvEngine {
	getEnv(key: string): EnvResult;
	getVisibleEnv(): Record<string, string>;
	isVisible(key: string): boolean;
}

/**
 * CLI engine interface
 */
export interface CliEngine {
	checkCommand(command: string): CliResult;
	isAllowed(command: string): boolean;
	transform(command: string): string | null;
}
