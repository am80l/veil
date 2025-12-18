#!/usr/bin/env node
/**
 * Veil MCP Server
 *
 * A Model Context Protocol server that intercepts CLI commands and environment
 * variable access, applying Veil rules before execution.
 *
 * Tools provided:
 * - run_command: Execute a shell command (with Veil filtering)
 * - get_env: Get an environment variable (with Veil filtering)
 * - check_command: Check if a command is allowed without executing
 * - check_env: Check if an env var is accessible without retrieving
 */

import { exec } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AuditManager, FileStorageAdapter } from "../audit.js";
import {
	PRESET_CI,
	PRESET_MINIMAL,
	PRESET_RECOMMENDED,
	PRESET_STRICT,
	mergeConfigs,
} from "../presets.js";
import type { VeilConfig } from "../types.js";
import { createVeil } from "../veil.js";

const execAsync = promisify(exec);

/**
 * Find the project root by walking up from a path looking for veil config files
 */
function findProjectRoot(startPath: string): string {
	const configFiles = [
		"veil.config.ts",
		"veil.config.js",
		"veil.config.mjs",
		".veilrc.ts",
		".veilrc.js",
		".veilrc.json",
	];

	let currentDir = startPath;
	const root = dirname(startPath) === startPath ? startPath : "/";

	while (currentDir !== root) {
		for (const configFile of configFiles) {
			if (existsSync(join(currentDir, configFile))) {
				return currentDir;
			}
		}
		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) break;
		currentDir = parentDir;
	}

	// Fall back to start path if no config found
	return startPath;
}

/**
 * Load veil config from the specified directory or current working directory
 * @param cwd - Optional directory to load config from. If not provided, uses process.cwd()
 */
async function loadVeilConfig(cwd?: string): Promise<VeilConfig | undefined> {
	const configPaths = [
		"veil.config.ts",
		"veil.config.js",
		"veil.config.mjs",
		".veilrc.ts",
		".veilrc.js",
	];

	const searchDir = cwd ?? process.cwd();
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
	const configPath = process.env["VEIL_CONFIG"];

	if (configPath) {
		const fullPath = resolve(searchDir, configPath);
		if (existsSync(fullPath)) {
			try {
				const loaded = (await import(pathToFileURL(fullPath).href)) as {
					default?: VeilConfig;
				} & VeilConfig;
				return loaded.default ?? loaded;
			} catch {
				console.error(`[veil-mcp] Failed to load config from ${fullPath}`);
			}
		}
	}

	for (const configFile of configPaths) {
		const fullPath = join(searchDir, configFile);
		if (existsSync(fullPath)) {
			try {
				const loaded = (await import(pathToFileURL(fullPath).href)) as {
					default?: VeilConfig;
				} & VeilConfig;
				return loaded.default ?? loaded;
			} catch {
				// Try next config file
			}
		}
	}

	// Try JSON config as fallback
	const jsonConfigPath = join(searchDir, ".veilrc.json");
	if (existsSync(jsonConfigPath)) {
		try {
			const content = readFileSync(jsonConfigPath, "utf-8");
			const parsed = JSON.parse(content) as VeilConfig & { extends?: string };

			// Preset map for extends support
			const PRESETS: Record<string, VeilConfig> = {
				recommended: PRESET_RECOMMENDED,
				strict: PRESET_STRICT,
				minimal: PRESET_MINIMAL,
				ci: PRESET_CI,
			};

			// Convert string patterns back to RegExp where appropriate
			const convertMatch = (match: string | RegExp): string | RegExp => {
				if (typeof match !== "string") return match;
				return match.startsWith("^") || match.includes("|") ? new RegExp(match, "i") : match;
			};

			const result: VeilConfig = {};

			// Preserve bypassProtection setting (defaults to true in createVeil)
			if (parsed.bypassProtection !== undefined) {
				result.bypassProtection = parsed.bypassProtection;
			}

			if (parsed.fileRules) {
				result.fileRules = parsed.fileRules.map((rule) => ({
					...rule,
					match: convertMatch(rule.match),
				}));
			}

			if (parsed.envRules) {
				result.envRules = parsed.envRules.map((rule) => ({
					...rule,
					match: convertMatch(rule.match),
				}));
			}

			if (parsed.cliRules) {
				result.cliRules = parsed.cliRules.map((rule) => ({
					...rule,
					match: convertMatch(rule.match),
				}));
			}

			// Handle extends - merge with base preset
			if (parsed.extends) {
				const preset = PRESETS[parsed.extends];
				if (preset) {
					// User rules take precedence (checked first), then preset rules
					return mergeConfigs(result, preset);
				}
				console.error(`[veil-mcp] Unknown preset: ${parsed.extends}`);
			}

			return result;
		} catch {
			console.error("[veil-mcp] Failed to parse .veilrc.json");
		}
	}

	return undefined;
}

/**
 * Format a Veil result for MCP response
 */
function formatBlockedResponse(reason?: string, alternatives?: string[]): CallToolResult {
	let message = "Command blocked by Veil security policy.";
	if (reason) {
		message += `\n\nReason: ${reason}`;
	}
	if (alternatives && alternatives.length > 0) {
		message += `\n\nSafe alternatives:\n${alternatives.map((a) => `  - ${a}`).join("\n")}`;
	}
	return {
		content: [{ type: "text", text: message }],
		isError: true,
	};
}

/**
 * Get a fresh Veil instance with config loaded from the specified directory (hot-reload support)
 * @param cwd - Optional directory to load config from. Will search up for veil config files.
 */
async function getVeil(cwd?: string): Promise<ReturnType<typeof createVeil>> {
	// If cwd provided, find the project root containing a veil config
	const configDir = cwd ? findProjectRoot(cwd) : undefined;
	const config = await loadVeilConfig(configDir);
	return createVeil(config ?? {});
}

/**
 * Create and start the Veil MCP server
 */
async function main(): Promise<void> {
	// Initialize audit logging
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
	const auditLogPath = process.env["VEIL_AUDIT_LOG"] ?? ".veil/audit.log";
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
	const auditFormat = (process.env["VEIL_AUDIT_FORMAT"] ?? "text") as "json" | "text";
	const auditAdapter = new FileStorageAdapter({ logPath: auditLogPath, format: auditFormat });
	const audit = new AuditManager(auditAdapter);

	// eslint-disable-next-line @typescript-eslint/no-deprecated -- Server is the correct low-level API for custom tool handlers
	const server = new Server(
		{ name: "veil-mcp", version: "0.1.0" },
		{ capabilities: { tools: { listChanged: false } } },
	);

	// List available tools
	server.setRequestHandler(ListToolsRequestSchema, () => {
		return {
			tools: [
				{
					name: "run_command",
					description:
						"Execute a shell command. Commands are validated against Veil security rules before execution. Dangerous commands may be blocked or rewritten.",
					inputSchema: {
						type: "object",
						properties: {
							command: {
								type: "string",
								description: "The shell command to execute",
							},
							cwd: {
								type: "string",
								description: "Working directory for command execution (optional)",
							},
							timeout: {
								type: "number",
								description: "Timeout in milliseconds (default: 30000)",
							},
						},
						required: ["command"],
					},
				},
				{
					name: "get_env",
					description:
						"Get the value of an environment variable. Access is validated against Veil security rules. Sensitive variables may be masked, blocked, or transformed.",
					inputSchema: {
						type: "object",
						properties: {
							name: {
								type: "string",
								description: "The name of the environment variable",
							},
							cwd: {
								type: "string",
								description:
									"Working directory to load Veil config from (optional). Uses project-specific rules.",
							},
						},
						required: ["name"],
					},
				},
				{
					name: "check_command",
					description:
						"Check if a command would be allowed by Veil security rules without executing it. Returns the validation result including any rewrites or blocks.",
					inputSchema: {
						type: "object",
						properties: {
							command: {
								type: "string",
								description: "The shell command to check",
							},
							cwd: {
								type: "string",
								description:
									"Working directory to load Veil config from (optional). Uses project-specific rules.",
							},
						},
						required: ["command"],
					},
				},
				{
					name: "check_env",
					description:
						"Check if an environment variable would be accessible by Veil security rules without retrieving it. Returns the validation result.",
					inputSchema: {
						type: "object",
						properties: {
							name: {
								type: "string",
								description: "The name of the environment variable to check",
							},
							cwd: {
								type: "string",
								description:
									"Working directory to load Veil config from (optional). Uses project-specific rules.",
							},
						},
						required: ["name"],
					},
				},
				{
					name: "check_file",
					description:
						"Check if a file path would be allowed by Veil security rules without reading it. Returns whether read/write access would be permitted.",
					inputSchema: {
						type: "object",
						properties: {
							path: {
								type: "string",
								description: "The file path to check",
							},
							operation: {
								type: "string",
								enum: ["read", "write"],
								description: "The operation to check (read or write). Default: read",
							},
						},
						required: ["path"],
					},
				},
				{
					name: "read_file",
					description:
						"Read a file's contents. Access is validated against Veil security rules. Sensitive files may be blocked.",
					inputSchema: {
						type: "object",
						properties: {
							path: {
								type: "string",
								description: "The file path to read",
							},
						},
						required: ["path"],
					},
				},
				{
					name: "write_file",
					description:
						"Write content to a file. Access is validated against Veil security rules. Protected files may be blocked.",
					inputSchema: {
						type: "object",
						properties: {
							path: {
								type: "string",
								description: "The file path to write to",
							},
							content: {
								type: "string",
								description: "The content to write to the file",
							},
						},
						required: ["path", "content"],
					},
				},
				{
					name: "get_audit_log",
					description:
						"Retrieve the audit log of all Veil-validated operations in this session. Useful for reviewing what commands/files were accessed.",
					inputSchema: {
						type: "object",
						properties: {
							limit: {
								type: "number",
								description: "Maximum number of records to return (default: 50)",
							},
							type: {
								type: "string",
								enum: ["cli", "env", "file"],
								description: "Filter by operation type",
							},
						},
						required: [],
					},
				},
			],
		};
	});

	// Handle tool calls
	server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
		const { name, arguments: args } = request.params;

		switch (name) {
			case "run_command": {
				const {
					command,
					cwd,
					timeout = 30000,
				} = args as {
					command: string;
					cwd?: string;
					timeout?: number;
				};

				// Hot-reload config from cwd and check command against Veil rules
				const veil = await getVeil(cwd);
				const result = veil.checkCommand(command);

				if (!result.ok) {
					// Log blocked command
					audit.record("cli", command, "deny", result.reason ?? "command_denied_by_policy");
					return formatBlockedResponse(result.reason, result.safeAlternatives);
				}

				// Log allowed command
				audit.record(
					"cli",
					command,
					result.command !== command ? "rewrite" : "allow",
					"command_allowed",
				);

				// Use potentially rewritten command
				const finalCommand = result.command ?? command;

				try {
					const { stdout, stderr } = await execAsync(finalCommand, {
						cwd: cwd ?? process.cwd(),
						timeout,
						maxBuffer: 10 * 1024 * 1024, // 10MB
					});

					let output = "";
					if (result.context) {
						output += `[Veil] ${result.context}\n\n`;
					}
					if (result.command !== command) {
						output += `[Veil] Command rewritten: ${command} → ${result.command}\n\n`;
					}
					output += stdout;
					if (stderr) {
						output += `\n\nStderr:\n${stderr}`;
					}

					return {
						content: [{ type: "text", text: output || "(no output)" }],
					};
				} catch (error) {
					const err = error as Error & { stdout?: string; stderr?: string; code?: number };
					return {
						content: [
							{
								type: "text",
								text: `Command failed (exit code ${err.code ?? "unknown"}):\n${err.stderr ?? err.message}\n\nStdout:\n${err.stdout ?? "(none)"}`,
							},
						],
						isError: true,
					};
				}
			}

			case "get_env": {
				const { name: envName, cwd } = args as { name: string; cwd?: string };

				const veil = await getVeil(cwd);
				const result = veil.getEnv(envName);

				if (!result.ok) {
					// Log blocked env access
					const blockedResult = result as { ok: false; reason?: string };
					audit.record("env", envName, "deny", blockedResult.reason ?? "env_denied_by_policy");
					return {
						content: [
							{
								type: "text",
								text: `Environment variable "${envName}" is not accessible.\n\nReason: ${blockedResult.reason ?? "Blocked by Veil security policy"}`,
							},
						],
						isError: true,
					};
				}

				// Log allowed env access (check if masked)
				const wasMasked = result.value !== process.env[envName];
				audit.record(
					"env",
					envName,
					wasMasked ? "mask" : "allow",
					wasMasked ? "env_masked" : "env_allowed",
				);

				let output = "";
				if (result.context) {
					output += `[Veil] ${result.context}\n\n`;
				}
				output += result.value ?? "(not set)";

				return {
					content: [{ type: "text", text: output }],
				};
			}

			case "check_command": {
				const { command, cwd } = args as { command: string; cwd?: string };

				const veil = await getVeil(cwd);
				const result = veil.checkCommand(command);

				if (!result.ok) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										allowed: false,
										reason: result.reason,
										safeAlternatives: result.safeAlternatives,
									},
									null,
									2,
								),
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									allowed: true,
									command: result.command,
									rewritten: result.command !== command,
									context: result.context,
								},
								null,
								2,
							),
						},
					],
				};
			}

			case "check_env": {
				const { name: envName, cwd } = args as { name: string; cwd?: string };

				const veil = await getVeil(cwd);
				const result = veil.getEnv(envName);

				if (!result.ok) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										accessible: false,
										reason: result.reason,
									},
									null,
									2,
								),
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									accessible: true,
									masked: result.value !== process.env[envName],
									context: result.context,
								},
								null,
								2,
							),
						},
					],
				};
			}

			case "check_file": {
				const { path: filePath, operation = "read" } = args as {
					path: string;
					operation?: "read" | "write";
				};
				const resolvedPath = resolve(process.cwd(), filePath);

				// Load config from the file's directory
				const veil = await getVeil(dirname(resolvedPath));
				const result = veil.checkFile(resolvedPath);

				if (!result.ok) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										allowed: false,
										path: resolvedPath,
										operation,
										reason: result.reason,
									},
									null,
									2,
								),
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									allowed: true,
									path: resolvedPath,
									operation,
								},
								null,
								2,
							),
						},
					],
				};
			}

			case "read_file": {
				const { path: filePath } = args as { path: string };
				const resolvedPath = resolve(process.cwd(), filePath);

				// Hot-reload config from file's directory and check file against Veil rules
				const veil = await getVeil(dirname(resolvedPath));
				const result = veil.checkFile(resolvedPath);

				if (!result.ok) {
					const blockedResult = result as { ok: false; reason?: string };
					audit.record(
						"file",
						resolvedPath,
						"deny",
						blockedResult.reason ?? "file_hidden_by_policy",
					);
					return {
						content: [
							{
								type: "text",
								text: `File "${resolvedPath}" is not accessible.\n\nReason: ${blockedResult.reason ?? "Blocked by Veil security policy"}`,
							},
						],
						isError: true,
					};
				}

				// Check if file exists
				if (!existsSync(resolvedPath)) {
					return {
						content: [
							{
								type: "text",
								text: `File not found: ${resolvedPath}`,
							},
						],
						isError: true,
					};
				}

				try {
					const content = readFileSync(resolvedPath, "utf-8");
					audit.record("file", resolvedPath, "allow", "file_read_allowed");
					return {
						content: [{ type: "text", text: content }],
					};
				} catch (error) {
					const err = error as Error;
					return {
						content: [
							{
								type: "text",
								text: `Failed to read file: ${err.message}`,
							},
						],
						isError: true,
					};
				}
			}

			case "write_file": {
				const { path: filePath, content } = args as { path: string; content: string };
				const resolvedPath = resolve(process.cwd(), filePath);

				// Hot-reload config from file's directory and check file against Veil rules
				const veil = await getVeil(dirname(resolvedPath));
				const result = veil.checkFile(resolvedPath);

				if (!result.ok) {
					const blockedResult = result as { ok: false; reason?: string };
					audit.record(
						"file",
						resolvedPath,
						"deny",
						blockedResult.reason ?? "file_hidden_by_policy",
					);
					return {
						content: [
							{
								type: "text",
								text: `Cannot write to "${resolvedPath}".\n\nReason: ${blockedResult.reason ?? "Blocked by Veil security policy"}`,
							},
						],
						isError: true,
					};
				}

				try {
					// Ensure directory exists
					const dir = dirname(resolvedPath);
					if (!existsSync(dir)) {
						mkdirSync(dir, { recursive: true });
					}

					writeFileSync(resolvedPath, content, "utf-8");
					audit.record("file", resolvedPath, "allow", "file_write_allowed");
					return {
						content: [
							{
								type: "text",
								text: `Successfully wrote ${content.length} bytes to ${resolvedPath}`,
							},
						],
					};
				} catch (error) {
					const err = error as Error;
					return {
						content: [
							{
								type: "text",
								text: `Failed to write file: ${err.message}`,
							},
						],
						isError: true,
					};
				}
			}

			case "get_audit_log": {
				const { limit = 50, type: filterType } = args as {
					limit?: number;
					type?: "cli" | "env" | "file";
				};

				const queryCriteria = filterType ? { type: filterType, limit } : { limit };
				const records = audit.query(queryCriteria);

				// Handle both sync and async results
				const resolvedRecords = await Promise.resolve(records);

				const formatted = resolvedRecords.map((r) => ({
					timestamp: new Date(r.timestamp).toISOString(),
					type: r.type,
					action: r.action,
					target: r.target,
					policy: r.policy,
				}));

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									count: formatted.length,
									records: formatted,
								},
								null,
								2,
							),
						},
					],
				};
			}

			default:
				return {
					content: [{ type: "text", text: `Unknown tool: ${name}` }],
					isError: true,
				};
		}
	});

	// Connect via stdio
	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Log to stderr (stdout is reserved for MCP protocol)
	console.error("[veil-mcp] Server started (hot-reload enabled)");
}

export { main as startMcpServer };

// Auto-run when executed directly (not imported via CLI)
// Check if this file is being run directly as a standalone script
const scriptPath = process.argv[1] ?? "";
const isDirectExecution =
	scriptPath.endsWith("mcp/index.cjs") ||
	scriptPath.endsWith("mcp/index.js") ||
	scriptPath.includes("veil-mcp");

if (isDirectExecution) {
	main().catch((error: unknown) => {
		console.error("[veil-mcp] Fatal error:", error);
		process.exit(1);
	});
}
