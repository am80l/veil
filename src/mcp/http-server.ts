#!/usr/bin/env node
/**
 * Veil MCP HTTP Server
 *
 * A Streamable HTTP transport server for the Veil MCP protocol.
 * This allows remote clients (like VS Code Remote SSH) to connect to Veil
 * running on a remote machine.
 *
 * Usage:
 *   npx veil mcp --http --port 3500
 *
 * Then configure VS Code on the client:
 *   {
 *     "servers": {
 *       "veil": {
 *         "url": "http://remote-host:3500/mcp"
 *       }
 *     }
 *   }
 */

import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ListToolsRequestSchema,
	isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { VeilConfig } from "../types.js";
import { createVeil } from "../veil.js";

const execAsync = promisify(exec);
const CONFIG_FILENAME = ".veilrc.json";

// Transport storage for session management
const transports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Load veil config from the current working directory
 */
async function loadVeilConfig(): Promise<VeilConfig | undefined> {
	const configPaths = [
		"veil.config.ts",
		"veil.config.js",
		"veil.config.mjs",
		".veilrc.ts",
		".veilrc.js",
	];

	const cwd = process.cwd();
	// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
	const configPath = process.env["VEIL_CONFIG"];

	// Try VEIL_CONFIG env var first
	if (configPath) {
		const fullPath = resolve(cwd, configPath);
		if (existsSync(fullPath)) {
			try {
				const loaded = (await import(pathToFileURL(fullPath).href)) as {
					default?: VeilConfig;
				} & VeilConfig;
				return loaded.default ?? loaded;
			} catch {
				console.error(`[veil-mcp-http] Failed to load config from ${fullPath}`);
			}
		}
	}

	// Try TypeScript/JS config files
	for (const configFile of configPaths) {
		const fullPath = join(cwd, configFile);
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

	// Try JSON config
	const jsonConfigPath = join(cwd, CONFIG_FILENAME);
	if (existsSync(jsonConfigPath)) {
		try {
			const content = readFileSync(jsonConfigPath, "utf-8");
			const parsed = JSON.parse(content) as VeilConfig;

			// Convert string patterns back to RegExp where appropriate
			const convertMatch = (match: string | RegExp): string | RegExp => {
				if (typeof match !== "string") return match;
				return match.startsWith("^") || match.includes("|") ? new RegExp(match, "i") : match;
			};

			const result: VeilConfig = {};

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

			return result;
		} catch {
			console.error(`[veil-mcp-http] Failed to parse ${CONFIG_FILENAME}`);
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
 * Create an MCP server with Veil tools
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Server is the correct low-level API for custom tool handlers
function createVeilServer(config: VeilConfig | undefined): Server {
	const veil = createVeil(config ?? {});

	// eslint-disable-next-line @typescript-eslint/no-deprecated -- Server is the correct low-level API for custom tool handlers
	const server = new Server(
		{ name: "veil-mcp", version: "0.2.0" },
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
						},
						required: ["name"],
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

				// Check command against Veil rules
				const result = veil.checkCommand(command);

				if (!result.ok) {
					return formatBlockedResponse(result.reason, result.safeAlternatives);
				}

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
				const { name: envName } = args as { name: string };

				const result = veil.getEnv(envName);

				if (!result.ok) {
					return {
						content: [
							{
								type: "text",
								text: `Environment variable "${envName}" is not accessible.\n\nReason: ${result.reason || "Blocked by Veil security policy"}`,
							},
						],
						isError: true,
					};
				}

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
				const { command } = args as { command: string };

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
				const { name: envName } = args as { name: string };

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

			default:
				return {
					content: [{ type: "text", text: `Unknown tool: ${name}` }],
					isError: true,
				};
		}
	});

	return server;
}

/**
 * Handle MCP HTTP requests (POST, GET, DELETE)
 */
async function handleMcpRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	config: VeilConfig | undefined,
): Promise<void> {
	if (req.method === "POST") {
		let body = "";
		req.on("data", (chunk: Buffer) => {
			body += chunk.toString();
		});

		req.on("end", () => {
			void handlePostRequest(body, req, res, config);
		});
	} else if (req.method === "GET") {
		await handleGetRequest(req, res);
	} else if (req.method === "DELETE") {
		await handleDeleteRequest(req, res);
	} else {
		res.writeHead(405, { "Content-Type": "application/json" });
		res.end(
			JSON.stringify({
				jsonrpc: "2.0",
				error: { code: -32000, message: "Method not allowed. Use POST, GET, or DELETE." },
				id: null,
			}),
		);
	}
}

/**
 * Handle POST requests to /mcp
 */
async function handlePostRequest(
	body: string,
	req: http.IncomingMessage,
	res: http.ServerResponse,
	config: VeilConfig | undefined,
): Promise<void> {
	try {
		const parsedBody: unknown = JSON.parse(body);
		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		let transport: StreamableHTTPServerTransport;

		if (sessionId && transports[sessionId]) {
			// Reuse existing session
			transport = transports[sessionId];
		} else if (!sessionId && isInitializeRequest(parsedBody)) {
			// New session initialization
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: (): string => randomUUID(),
				onsessioninitialized: (id: string): void => {
					transports[id] = transport;
					console.error(`[veil-mcp-http] Session initialized: ${id}`);
				},
				onsessionclosed: (id: string): void => {
					removeSession(id);
					console.error(`[veil-mcp-http] Session closed: ${id}`);
				},
			});

			transport.onclose = (): void => {
				if (transport.sessionId) {
					removeSession(transport.sessionId);
				}
			};

			const server = createVeilServer(config);
			// Type assertion needed due to exactOptionalPropertyTypes mismatch
			await server.connect(transport as Transport);
		} else {
			// Invalid session or missing initialization
			res.writeHead(400, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message:
							"Invalid session. Send an initialize request without mcp-session-id header to start a new session.",
					},
					id: null,
				}),
			);
			return;
		}

		// Create a mock express-like request/response
		const mockReq = Object.assign(req, { body: parsedBody });

		await transport.handleRequest(mockReq, res, parsedBody);
	} catch (error) {
		console.error("[veil-mcp-http] Error handling request:", error);
		if (!res.headersSent) {
			res.writeHead(500, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					jsonrpc: "2.0",
					error: { code: -32603, message: "Internal server error" },
					id: null,
				}),
			);
		}
	}
}

/**
 * Handle GET requests for SSE streams
 */
async function handleGetRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	const sessionId = req.headers["mcp-session-id"] as string;
	const transport = transports[sessionId];
	if (transport) {
		await transport.handleRequest(req, res);
	} else {
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Invalid session" }));
	}
}

/**
 * Handle DELETE requests for session termination
 */
async function handleDeleteRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
): Promise<void> {
	const sessionId = req.headers["mcp-session-id"] as string;
	const transport = transports[sessionId];
	if (transport) {
		await transport.handleRequest(req, res);
	} else {
		res.writeHead(400, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Invalid session" }));
	}
}

/**
 * Helper to remove a session from the transports map
 */
function removeSession(id: string): void {
	const transport = transports[id];
	if (transport) {
		void transport.close();
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete transports[id];
	}
}

/**
 * Start the HTTP server
 */
export async function startHttpServer(port = 3500, host = "0.0.0.0"): Promise<void> {
	const config = await loadVeilConfig();

	console.error(`[veil-mcp-http] Starting server on ${host}:${port}`);
	if (config) {
		console.error("[veil-mcp-http] Loaded config from workspace");
	} else {
		console.error("[veil-mcp-http] No config found, using permissive defaults");
	}

	const httpServer = http.createServer((req, res) => {
		// CORS headers for cross-origin requests
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

		// Health check endpoint
		if (url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ status: "ok", service: "veil-mcp" }));
			return;
		}

		// MCP endpoint - POST for requests
		if (url.pathname === "/mcp") {
			void handleMcpRequest(req, res, config);
			return;
		}

		// 404 for unknown paths
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Not found" }));
	});

	httpServer.listen(port, host, () => {
		console.error(`[veil-mcp-http] Server listening on http://${host}:${port}`);
		console.error(`[veil-mcp-http] MCP endpoint: http://${host}:${port}/mcp`);
		console.error(`[veil-mcp-http] Health check: http://${host}:${port}/health`);
	});

	// Handle shutdown
	process.on("SIGINT", () => {
		console.error("\n[veil-mcp-http] Shutting down...");
		// Close all active transports
		for (const [id, transport] of Object.entries(transports)) {
			console.error(`[veil-mcp-http] Closing session: ${id}`);
			void transport.close();
		}
		httpServer.close();
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		console.error("[veil-mcp-http] Received SIGTERM, shutting down...");
		// Close all active transports
		for (const [id, transport] of Object.entries(transports)) {
			console.error(`[veil-mcp-http] Closing session: ${id}`);
			void transport.close();
		}
		httpServer.close();
		process.exit(0);
	});
}

export { startHttpServer as main };
