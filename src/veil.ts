/**
 * Veil - Main Implementation
 *
 * The core Veil factory and guard functionality
 */

import { createCliEngine } from "./cli-engine";
import { createEnvEngine } from "./env-engine";
import { createFileEngine } from "./file-engine";
import type {
	CliResult,
	DirectoryResult,
	EnvResult,
	FileResult,
	InterceptRecord,
	RuleAction,
	ScopedPolicy,
	Veil,
	VeilConfig,
	VeilContext,
	VeilSuccess,
} from "./types";

/**
 * Create a new Veil instance
 *
 * @example
 * ```ts
 * const veil = createVeil({
 *   fileRules: [
 *     { match: "node_modules", action: "deny" },
 *     { match: /secrets/, action: "deny" }
 *   ],
 *   envRules: [
 *     { match: /^AWS_/, action: "mask" }
 *   ],
 *   cliRules: [
 *     { match: /^rm -rf/, action: "deny" }
 *   ]
 * });
 * ```
 */
export function createVeil(config: VeilConfig = {}): Veil {
	const fileRules = config.fileRules ?? [];
	const envRules = config.envRules ?? [];
	const cliRules = config.cliRules ?? [];
	const injectors = config.injectors;

	// Create engines
	const fileEngine = createFileEngine(fileRules, injectors);
	const envEngine = createEnvEngine(envRules, injectors);
	const cliEngine = createCliEngine(cliRules);

	// Intercept log
	const interceptedCalls: InterceptRecord[] = [];

	/**
	 * Log an intercepted call
	 */
	function logIntercept(
		type: InterceptRecord["type"],
		target: string,
		action: RuleAction,
		policy: string
	): void {
		interceptedCalls.push({
			type,
			target,
			action,
			timestamp: Date.now(),
			policy,
		});
	}

	/**
	 * Check file access
	 */
	function checkFile(path: string): FileResult | VeilSuccess<true> {
		const result = fileEngine.checkFile(path);
		if (!result.ok) {
			logIntercept("file", path, result.details.action, result.details.policy);
		}
		return result;
	}

	/**
	 * Check directory access
	 */
	function checkDirectory(path: string): DirectoryResult | VeilSuccess<true> {
		const result = fileEngine.checkDirectory(path);
		if (!result.ok) {
			logIntercept("directory", path, result.details.action, result.details.policy);
		}
		return result;
	}

	/**
	 * Filter paths
	 */
	function filterPaths(paths: string[]): string[] {
		return fileEngine.filterPaths(paths);
	}

	/**
	 * Get environment variable
	 */
	function getEnv(key: string): EnvResult {
		const result = envEngine.getEnv(key);
		if (!result.ok) {
			logIntercept("env", key, result.details.action, result.details.policy);
		}
		return result;
	}

	/**
	 * Get all visible environment variables
	 */
	function getVisibleEnv(): Record<string, string> {
		return envEngine.getVisibleEnv();
	}

	/**
	 * Check/transform a CLI command
	 */
	function checkCommand(command: string): CliResult {
		const result = cliEngine.checkCommand(command);
		if (!result.ok && result.reason) {
			logIntercept("cli", command, "deny", "cliRules");
		}
		return result;
	}

	/**
	 * Execute a guarded operation
	 */
	async function guard<T>(operation: () => T | Promise<T>): Promise<T> {
		// In a real implementation, this would proxy filesystem/env/CLI access
		// For now, we just execute the operation in a context where
		// the engines are available
		return await operation();
	}

	/**
	 * Create a scoped instance with additional rules
	 */
	function scope(policy: Omit<ScopedPolicy, "layer">): Veil {
		// Merge rules - scoped rules take priority (checked first)
		const scopedConfig: VeilConfig = {
			fileRules: [...(policy.fileRules ?? []), ...fileRules],
			envRules: [...(policy.envRules ?? []), ...envRules],
			cliRules: [...(policy.cliRules ?? []), ...cliRules],
			injectors,
		};

		return createVeil(scopedConfig);
	}

	/**
	 * Get the current veil context
	 */
	function getContext(): VeilContext {
		return {
			visibleFiles: [], // Would be populated during guard execution
			visibleDirectories: [],
			visibleEnv: getVisibleEnv(),
			interceptedCalls: [...interceptedCalls],
		};
	}

	/**
	 * Get all intercepted calls
	 */
	function getInterceptedCalls(): InterceptRecord[] {
		return [...interceptedCalls];
	}

	/**
	 * Clear intercepted calls
	 */
	function clearInterceptedCalls(): void {
		interceptedCalls.length = 0;
	}

	return {
		checkFile,
		checkDirectory,
		filterPaths,
		getEnv,
		getVisibleEnv,
		checkCommand,
		guard,
		scope,
		getContext,
		getInterceptedCalls,
		clearInterceptedCalls,
	};
}
