/**
 * Veil Plugin System
 *
 * Extensible middleware architecture for Veil
 */

import type { CliResult, EnvResult, FileResult, VeilConfig } from "./types";

/**
 * Hook context for file operations
 */
export interface FileHookContext {
	path: string;
	operation: "checkFile" | "checkDirectory" | "filterPaths";
}

/**
 * Hook context for environment operations
 */
export interface EnvHookContext {
	key: string;
	operation: "getEnv" | "getVisibleEnv";
}

/**
 * Hook context for CLI operations
 */
export interface CliHookContext {
	command: string;
	operation: "checkCommand";
}

/**
 * Union of all hook contexts
 */
export type HookContext = FileHookContext | EnvHookContext | CliHookContext;

/**
 * Result from a before hook
 * - undefined: continue normal processing
 * - result object: short-circuit and return this result
 */
export type BeforeHookResult<T> = T | undefined;

/**
 * Plugin interface for extending Veil functionality
 */
export interface VeilPlugin {
	/** Unique plugin name */
	name: string;

	/**
	 * Called before any file check
	 * Return a result to short-circuit, or undefined to continue
	 */
	beforeFileCheck?(context: FileHookContext): BeforeHookResult<FileResult>;

	/**
	 * Called after a file check completes
	 * Can modify the result before it's returned
	 */
	afterFileCheck?(context: FileHookContext, result: FileResult): FileResult;

	/**
	 * Called before any env check
	 */
	beforeEnvCheck?(context: EnvHookContext): BeforeHookResult<EnvResult>;

	/**
	 * Called after an env check completes
	 */
	afterEnvCheck?(context: EnvHookContext, result: EnvResult): EnvResult;

	/**
	 * Called before any CLI check
	 */
	beforeCliCheck?(context: CliHookContext): BeforeHookResult<CliResult>;

	/**
	 * Called after a CLI check completes
	 */
	afterCliCheck?(context: CliHookContext, result: CliResult): CliResult;

	/**
	 * Called when the plugin is installed
	 */
	install?(config: VeilConfig): void;
}

/**
 * Plugin manager for registering and running plugins
 */
export class PluginManager {
	private plugins: VeilPlugin[] = [];

	/**
	 * Register a plugin
	 */
	use(plugin: VeilPlugin): this {
		if (this.plugins.some((p) => p.name === plugin.name)) {
			console.warn(`Plugin "${plugin.name}" is already registered`);
			return this;
		}
		this.plugins.push(plugin);
		return this;
	}

	/**
	 * Remove a plugin by name
	 */
	remove(name: string): boolean {
		const index = this.plugins.findIndex((p) => p.name === name);
		if (index >= 0) {
			this.plugins.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Get all registered plugins
	 */
	getPlugins(): readonly VeilPlugin[] {
		return this.plugins;
	}

	/**
	 * Install all plugins with config
	 */
	installAll(config: VeilConfig): void {
		for (const plugin of this.plugins) {
			plugin.install?.(config);
		}
	}

	/**
	 * Run before file check hooks
	 */
	runBeforeFileCheck(context: FileHookContext): FileResult | undefined {
		for (const plugin of this.plugins) {
			const result = plugin.beforeFileCheck?.(context);
			if (result !== undefined) {
				return result;
			}
		}
		return undefined;
	}

	/**
	 * Run after file check hooks
	 */
	runAfterFileCheck(context: FileHookContext, result: FileResult): FileResult {
		let currentResult = result;
		for (const plugin of this.plugins) {
			if (plugin.afterFileCheck) {
				currentResult = plugin.afterFileCheck(context, currentResult);
			}
		}
		return currentResult;
	}

	/**
	 * Run before env check hooks
	 */
	runBeforeEnvCheck(context: EnvHookContext): EnvResult | undefined {
		for (const plugin of this.plugins) {
			const result = plugin.beforeEnvCheck?.(context);
			if (result !== undefined) {
				return result;
			}
		}
		return undefined;
	}

	/**
	 * Run after env check hooks
	 */
	runAfterEnvCheck(context: EnvHookContext, result: EnvResult): EnvResult {
		let currentResult = result;
		for (const plugin of this.plugins) {
			if (plugin.afterEnvCheck) {
				currentResult = plugin.afterEnvCheck(context, currentResult);
			}
		}
		return currentResult;
	}

	/**
	 * Run before CLI check hooks
	 */
	runBeforeCliCheck(context: CliHookContext): CliResult | undefined {
		for (const plugin of this.plugins) {
			const result = plugin.beforeCliCheck?.(context);
			if (result !== undefined) {
				return result;
			}
		}
		return undefined;
	}

	/**
	 * Run after CLI check hooks
	 */
	runAfterCliCheck(context: CliHookContext, result: CliResult): CliResult {
		let currentResult = result;
		for (const plugin of this.plugins) {
			if (plugin.afterCliCheck) {
				currentResult = plugin.afterCliCheck(context, currentResult);
			}
		}
		return currentResult;
	}
}

/**
 * Create a simple logging plugin
 */
export function createLoggingPlugin(
	logger: (message: string, data?: unknown) => void = console.log,
): VeilPlugin {
	return {
		name: "logging",
		afterFileCheck(context, result): FileResult {
			logger(
				`[veil:file] ${context.operation} "${context.path}" → ${result.ok ? "allowed" : "blocked"}`,
			);
			return result;
		},
		afterEnvCheck(context, result): EnvResult {
			logger(
				`[veil:env] ${context.operation} "${context.key}" → ${result.ok ? "allowed" : "blocked"}`,
			);
			return result;
		},
		afterCliCheck(context, result): CliResult {
			logger(
				`[veil:cli] ${context.operation} "${context.command}" → ${result.ok ? "allowed" : "blocked"}`,
			);
			return result;
		},
	};
}

/**
 * Create a metrics plugin that tracks usage
 */
export function createMetricsPlugin(): VeilPlugin & {
	getMetrics(): { files: number; env: number; cli: number; blocked: number };
	reset(): void;
} {
	let metrics = { files: 0, env: 0, cli: 0, blocked: 0 };

	return {
		name: "metrics",
		afterFileCheck(_context, result): FileResult {
			metrics.files++;
			if (!result.ok) metrics.blocked++;
			return result;
		},
		afterEnvCheck(_context, result): EnvResult {
			metrics.env++;
			if (!result.ok) metrics.blocked++;
			return result;
		},
		afterCliCheck(_context, result): CliResult {
			metrics.cli++;
			if (!result.ok) metrics.blocked++;
			return result;
		},
		getMetrics(): { files: number; env: number; cli: number; blocked: number } {
			return { ...metrics };
		},
		reset(): void {
			metrics = { files: 0, env: 0, cli: 0, blocked: 0 };
		},
	};
}
