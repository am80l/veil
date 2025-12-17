/**
 * Plugin System Tests
 *
 * Tests for the VeilPlugin interface and PluginManager
 */

import { describe, expect, it, vi } from "vitest";
import { PluginManager, createLoggingPlugin, createMetricsPlugin } from "./plugins";
import type { VeilPlugin } from "./plugins";

describe("PluginManager", () => {
	describe("use/remove", () => {
		it("registers plugins via use()", () => {
			const manager = new PluginManager();
			const plugin: VeilPlugin = { name: "test-plugin" };

			manager.use(plugin);
			expect(manager.getPlugins()).toHaveLength(1);
			expect(manager.getPlugins()[0].name).toBe("test-plugin");
		});

		it("removes plugins by name", () => {
			const manager = new PluginManager();
			manager.use({ name: "plugin-a" });
			manager.use({ name: "plugin-b" });

			manager.remove("plugin-a");
			expect(manager.getPlugins()).toHaveLength(1);
			expect(manager.getPlugins()[0].name).toBe("plugin-b");
		});

		it("returns this for chaining", () => {
			const manager = new PluginManager();
			const result = manager.use({ name: "plugin-a" }).use({ name: "plugin-b" });
			expect(result).toBe(manager);
			expect(manager.getPlugins()).toHaveLength(2);
		});
	});

	describe("before file check hooks", () => {
		it("runs beforeFileCheck hooks", () => {
			const manager = new PluginManager();
			const beforeFn = vi.fn();

			manager.use({
				name: "test",
				beforeFileCheck: beforeFn,
			});

			manager.runBeforeFileCheck({
				path: "/path/to/file.txt",
				operation: "checkFile",
			});
			expect(beforeFn).toHaveBeenCalledWith({
				path: "/path/to/file.txt",
				operation: "checkFile",
			});
		});

		it("can short-circuit via before hooks", () => {
			const manager = new PluginManager();

			manager.use({
				name: "blocker",
				beforeFileCheck: () => ({
					ok: false,
					blocked: true,
					reason: "plugin_blocked" as const,
					details: {
						target: "/secret.txt",
						policy: "plugin",
						action: "deny" as const,
					},
				}),
			});

			const result = manager.runBeforeFileCheck({
				path: "/secret.txt",
				operation: "checkFile",
			});
			expect(result?.ok).toBe(false);
		});
	});

	describe("after file check hooks", () => {
		it("runs afterFileCheck hooks", () => {
			const manager = new PluginManager();
			const afterFn = vi.fn((_, result) => result);

			manager.use({
				name: "test",
				afterFileCheck: afterFn,
			});

			const mockResult = { ok: true as const, value: "/path/to/file.txt" };
			manager.runAfterFileCheck({ path: "/path/to/file.txt", operation: "checkFile" }, mockResult);
			expect(afterFn).toHaveBeenCalled();
		});

		it("allows modifying results", () => {
			const manager = new PluginManager();

			manager.use({
				name: "modifier",
				afterFileCheck: (_, result) => {
					if (result.ok) {
						return { ...result, modified: true } as never;
					}
					return result;
				},
			});

			const mockResult = { ok: true as const, value: "/test.txt" };
			const modified = manager.runAfterFileCheck(
				{ path: "/test.txt", operation: "checkFile" },
				mockResult,
			);
			expect((modified as { modified?: boolean }).modified).toBe(true);
		});
	});

	describe("before env check hooks", () => {
		it("runs beforeEnvCheck hooks", () => {
			const manager = new PluginManager();
			const beforeFn = vi.fn();

			manager.use({
				name: "test",
				beforeEnvCheck: beforeFn,
			});

			manager.runBeforeEnvCheck({ key: "API_KEY", operation: "getEnv" });
			expect(beforeFn).toHaveBeenCalledWith({
				key: "API_KEY",
				operation: "getEnv",
			});
		});
	});

	describe("before cli check hooks", () => {
		it("runs beforeCliCheck hooks", () => {
			const manager = new PluginManager();
			const beforeFn = vi.fn();

			manager.use({
				name: "test",
				beforeCliCheck: beforeFn,
			});

			manager.runBeforeCliCheck({
				command: "npm install",
				operation: "checkCommand",
			});
			expect(beforeFn).toHaveBeenCalledWith({
				command: "npm install",
				operation: "checkCommand",
			});
		});
	});
});

describe("createLoggingPlugin", () => {
	it("logs file operations", () => {
		const logs: string[] = [];
		const logger = (msg: string) => logs.push(msg);

		const manager = new PluginManager();
		manager.use(createLoggingPlugin(logger));

		manager.runAfterFileCheck(
			{ path: "/test.txt", operation: "checkFile" },
			{ ok: true, value: "/test.txt" },
		);
		expect(logs).toHaveLength(1);
		expect(logs[0]).toContain("checkFile");
		expect(logs[0]).toContain("/test.txt");
		expect(logs[0]).toContain("allowed");
	});

	it("logs env operations", () => {
		const logs: string[] = [];
		const logger = (msg: string) => logs.push(msg);

		const manager = new PluginManager();
		manager.use(createLoggingPlugin(logger));

		manager.runAfterEnvCheck({ key: "SECRET", operation: "getEnv" }, { ok: true, value: "value" });
		expect(logs).toHaveLength(1);
		expect(logs[0]).toContain("getEnv");
		expect(logs[0]).toContain("SECRET");
	});
});

describe("createMetricsPlugin", () => {
	it("tracks file check counts", () => {
		const metricsPlugin = createMetricsPlugin();
		const manager = new PluginManager();
		manager.use(metricsPlugin);

		manager.runAfterFileCheck(
			{ path: "/a.txt", operation: "checkFile" },
			{ ok: true, value: "/a.txt" },
		);
		manager.runAfterFileCheck(
			{ path: "/b.txt", operation: "checkFile" },
			{ ok: true, value: "/b.txt" },
		);

		const metrics = metricsPlugin.getMetrics();
		expect(metrics.files).toBe(2);
	});

	it("tracks blocked count", () => {
		const metricsPlugin = createMetricsPlugin();
		const manager = new PluginManager();
		manager.use(metricsPlugin);

		manager.runAfterFileCheck(
			{ path: "/a.txt", operation: "checkFile" },
			{
				ok: false,
				blocked: true,
				reason: "file_hidden_by_policy",
				details: { target: "/a.txt", policy: "test", action: "deny" },
			},
		);

		const metrics = metricsPlugin.getMetrics();
		expect(metrics.blocked).toBe(1);
	});

	it("tracks env checks", () => {
		const metricsPlugin = createMetricsPlugin();
		const manager = new PluginManager();
		manager.use(metricsPlugin);

		manager.runAfterEnvCheck(
			{ key: "API_KEY", operation: "getEnv" },
			{ ok: true, value: "abc123" },
		);

		const metrics = metricsPlugin.getMetrics();
		expect(metrics.env).toBe(1);
	});

	it("can reset metrics", () => {
		const metricsPlugin = createMetricsPlugin();
		const manager = new PluginManager();
		manager.use(metricsPlugin);

		manager.runAfterFileCheck(
			{ path: "/a.txt", operation: "checkFile" },
			{ ok: true, value: "/a.txt" },
		);
		metricsPlugin.reset();

		const metrics = metricsPlugin.getMetrics();
		expect(metrics.files).toBe(0);
	});
});
