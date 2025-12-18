/**
 * Command Normalization
 *
 * Preprocesses CLI commands to extract the "real" command from common
 * bypass vectors like subshells, absolute paths, and wrapper commands.
 *
 * This provides centralized bypass protection so individual rules don't
 * need to account for every possible evasion technique.
 */

export interface NormalizeOptions {
	/** Strip absolute paths from commands (e.g., /usr/bin/git → git) */
	stripPaths?: boolean;
	/** Unwrap subshell wrappers (e.g., bash -c "git push" → git push) */
	unwrapShells?: boolean;
	/** Unwrap eval commands (e.g., eval "git push" → git push) */
	unwrapEval?: boolean;
	/** Strip npx/pnpx/yarn prefixes (e.g., npx wrangler → wrangler) */
	stripPackageRunners?: boolean;
}

const DEFAULT_OPTIONS: NormalizeOptions = {
	stripPaths: true,
	unwrapShells: true,
	unwrapEval: true,
	stripPackageRunners: true,
};

/**
 * Shell wrapper patterns to unwrap
 * Matches: bash -c "...", sh -c '...', zsh -c ..., etc.
 */
const SHELL_WRAPPER_PATTERNS = [
	// bash -c "command" or bash -c 'command'
	/^(?:bash|sh|zsh|dash|ksh|csh|tcsh|fish)\s+(?:-\w+\s+)*-c\s+["'](.+?)["']\s*$/,
	// bash -c command (unquoted)
	/^(?:bash|sh|zsh|dash|ksh|csh|tcsh|fish)\s+(?:-\w+\s+)*-c\s+(.+)$/,
];

/**
 * Eval patterns to unwrap
 * Matches: eval "command", eval 'command', eval command
 */
const EVAL_PATTERNS = [/^eval\s+["'](.+?)["']\s*$/, /^eval\s+(.+)$/];

/**
 * Absolute path pattern
 * Matches: /usr/bin/git, /bin/rm, etc.
 */
const ABSOLUTE_PATH_PATTERN = /^(\/[\w\-.]+)+\//;

/**
 * Package runner prefixes to strip
 */
const PACKAGE_RUNNER_PATTERN = /^(?:npx|pnpx|yarn\s+dlx|bunx)\s+/;

/**
 * Normalize a command by extracting the "real" command from wrappers.
 *
 * Returns an array of command variants to check against rules.
 * The original command is always included first, followed by normalized variants.
 *
 * @param command - The raw command string
 * @param options - Normalization options
 * @returns Array of command variants (original + normalized)
 */
export function normalizeCommand(
	command: string,
	options: NormalizeOptions = DEFAULT_OPTIONS,
): string[] {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const variants: string[] = [];
	const seen = new Set<string>();

	// Helper to add unique variants
	const addVariant = (cmd: string): void => {
		const trimmed = cmd.trim();
		if (trimmed && !seen.has(trimmed)) {
			seen.add(trimmed);
			variants.push(trimmed);
		}
	};

	// Always include original
	addVariant(command);

	// Work with trimmed version
	let current = command.trim();

	// Unwrap shells (potentially recursive for nested shells)
	if (opts.unwrapShells) {
		let unwrapped = true;
		let iterations = 0;
		const maxIterations = 5; // Prevent infinite loops

		while (unwrapped && iterations < maxIterations) {
			unwrapped = false;
			iterations++;

			for (const pattern of SHELL_WRAPPER_PATTERNS) {
				const match = current.match(pattern);
				if (match?.[1]) {
					current = match[1].trim();
					addVariant(current);
					unwrapped = true;
					break;
				}
			}
		}
	}

	// Unwrap eval
	if (opts.unwrapEval) {
		for (const pattern of EVAL_PATTERNS) {
			const match = current.match(pattern);
			if (match?.[1]) {
				current = match[1].trim();
				addVariant(current);
				break;
			}
		}
	}

	// Strip absolute paths
	if (opts.stripPaths && ABSOLUTE_PATH_PATTERN.test(current)) {
		const stripped = current.replace(ABSOLUTE_PATH_PATTERN, "");
		addVariant(stripped);
		current = stripped;
	}

	// Strip package runners
	if (opts.stripPackageRunners && PACKAGE_RUNNER_PATTERN.test(current)) {
		const stripped = current.replace(PACKAGE_RUNNER_PATTERN, "");
		addVariant(stripped);
	}

	return variants;
}

/**
 * Check if a command appears to be a bypass attempt.
 *
 * This is useful for logging/auditing when a normalized command
 * differs from the original.
 *
 * @param command - The raw command string
 * @returns true if the command uses wrapper techniques
 */
export function isWrappedCommand(command: string): boolean {
	const trimmed = command.trim();

	// Check for shell wrappers
	for (const pattern of SHELL_WRAPPER_PATTERNS) {
		if (pattern.test(trimmed)) return true;
	}

	// Check for eval
	for (const pattern of EVAL_PATTERNS) {
		if (pattern.test(trimmed)) return true;
	}

	// Check for absolute paths to common binaries
	if (ABSOLUTE_PATH_PATTERN.test(trimmed)) return true;

	return false;
}

/**
 * Get a description of what normalization was applied.
 *
 * @param original - The original command
 * @param normalized - The normalized command
 * @returns Human-readable description of normalization
 */
export function describeNormalization(original: string, normalized: string): string | null {
	if (original.trim() === normalized.trim()) return null;

	const descriptions: string[] = [];

	// Check what was stripped
	for (const pattern of SHELL_WRAPPER_PATTERNS) {
		if (pattern.test(original.trim())) {
			descriptions.push("subshell wrapper stripped");
			break;
		}
	}

	for (const pattern of EVAL_PATTERNS) {
		if (pattern.test(original.trim())) {
			descriptions.push("eval wrapper stripped");
			break;
		}
	}

	if (
		ABSOLUTE_PATH_PATTERN.test(original.trim()) &&
		!ABSOLUTE_PATH_PATTERN.test(normalized.trim())
	) {
		descriptions.push("absolute path stripped");
	}

	if (
		PACKAGE_RUNNER_PATTERN.test(original.trim()) &&
		!PACKAGE_RUNNER_PATTERN.test(normalized.trim())
	) {
		descriptions.push("package runner stripped");
	}

	return descriptions.length > 0 ? descriptions.join(", ") : "command normalized";
}
