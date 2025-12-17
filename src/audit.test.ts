/**
 * Audit System Tests
 *
 * Tests for AuditManager and storage adapters
 */

import { describe, expect, it, vi } from "vitest";
import { AuditManager, MemoryStorageAdapter, createConsoleStorageAdapter } from "./audit";
import type { AuditEvent } from "./audit";

describe("MemoryStorageAdapter", () => {
	it("stores records", () => {
		const storage = new MemoryStorageAdapter();

		storage.store({
			type: "file",
			target: "/test.txt",
			action: "deny",
			timestamp: Date.now(),
			policy: "test",
		});

		const records = storage.getAll();
		expect(records).toHaveLength(1);
	});

	it("queries by type", () => {
		const storage = new MemoryStorageAdapter();

		storage.store({
			type: "file",
			target: "/file.txt",
			action: "deny",
			timestamp: Date.now(),
			policy: "test",
		});
		storage.store({
			type: "env",
			target: "API_KEY",
			action: "mask",
			timestamp: Date.now(),
			policy: "test",
		});

		const fileRecords = storage.query({ type: "file" });
		expect(fileRecords).toHaveLength(1);
		expect(fileRecords[0].type).toBe("file");
	});

	it("queries by action", () => {
		const storage = new MemoryStorageAdapter();

		storage.store({
			type: "file",
			target: "/a.txt",
			action: "deny",
			timestamp: Date.now(),
			policy: "test",
		});
		storage.store({
			type: "file",
			target: "/b.txt",
			action: "allow",
			timestamp: Date.now(),
			policy: "test",
		});

		const deniedRecords = storage.query({ action: "deny" });
		expect(deniedRecords).toHaveLength(1);
		expect(deniedRecords[0].target).toBe("/a.txt");
	});

	it("queries by time range", () => {
		const storage = new MemoryStorageAdapter();
		const now = Date.now();

		storage.store({
			type: "file",
			target: "/old.txt",
			action: "deny",
			timestamp: now - 10000,
			policy: "test",
		});
		storage.store({
			type: "file",
			target: "/new.txt",
			action: "deny",
			timestamp: now,
			policy: "test",
		});

		const recentRecords = storage.query({ since: now - 5000 });
		expect(recentRecords).toHaveLength(1);
		expect(recentRecords[0].target).toBe("/new.txt");
	});

	it("clears all records", () => {
		const storage = new MemoryStorageAdapter();

		storage.store({
			type: "file",
			target: "/test.txt",
			action: "deny",
			timestamp: Date.now(),
			policy: "test",
		});

		storage.clear();
		const records = storage.getAll();
		expect(records).toHaveLength(0);
	});

	it("respects maxRecords limit", () => {
		const storage = new MemoryStorageAdapter({ maxRecords: 3 });

		for (let i = 0; i < 5; i++) {
			storage.store({
				type: "file",
				target: `/file${i}.txt`,
				action: "deny",
				timestamp: Date.now(),
				policy: "test",
			});
		}

		const records = storage.getAll();
		expect(records).toHaveLength(3);
		expect(records[0].target).toBe("/file2.txt"); // First 2 trimmed
	});
});

describe("AuditManager", () => {
	it("records events to storage", () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);

		audit.record("file", "/test.txt", "deny", "fileRules[0]");

		const records = storage.getAll();
		expect(records).toHaveLength(1);
		expect(records[0].target).toBe("/test.txt");
	});

	it("emits events on record", () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);
		const listener = vi.fn();

		audit.on("deny", listener);

		audit.record("file", "/test.txt", "deny", "test");
		expect(listener).toHaveBeenCalled();
		const event: AuditEvent = listener.mock.calls[0][0];
		expect(event.type).toBe("deny");
		expect(event.record.target).toBe("/test.txt");
	});

	it("emits to wildcard listeners", () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);
		const wildcardListener = vi.fn();

		audit.on("*", wildcardListener);

		audit.record("file", "/a.txt", "deny", "test");
		audit.record("env", "API_KEY", "mask", "test");

		expect(wildcardListener).toHaveBeenCalledTimes(2);
	});

	it("supports once() for one-time listeners", () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);
		const listener = vi.fn();

		audit.once("deny", listener);

		audit.record("file", "/a.txt", "deny", "test");
		audit.record("file", "/b.txt", "deny", "test");

		// Should only be called once
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("supports off() to remove all listeners for event type", () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);
		const listener = vi.fn();

		audit.on("deny", listener);
		audit.off("deny");

		audit.record("file", "/test.txt", "deny", "test");

		expect(listener).not.toHaveBeenCalled();
	});

	it("returns unsubscribe function from on()", () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);
		const listener = vi.fn();

		const unsubscribe = audit.on("deny", listener);
		unsubscribe();

		audit.record("file", "/test.txt", "deny", "test");

		expect(listener).not.toHaveBeenCalled();
	});

	it("queries records through storage", async () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);

		audit.record("file", "/a.txt", "deny", "test");
		audit.record("env", "SECRET", "mask", "test");

		const fileRecords = await audit.query({ type: "file" });
		expect(fileRecords).toHaveLength(1);
	});

	it("clears records through storage", async () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);

		audit.record("file", "/test.txt", "deny", "test");

		await audit.clear();
		const records = await audit.query({});
		expect(records).toHaveLength(0);
	});

	it("maps actions to event types correctly", () => {
		const storage = new MemoryStorageAdapter();
		const audit = new AuditManager(storage);
		const denyListener = vi.fn();
		const maskListener = vi.fn();
		const rewriteListener = vi.fn();
		const allowListener = vi.fn();

		audit.on("deny", denyListener);
		audit.on("mask", maskListener);
		audit.on("rewrite", rewriteListener);
		audit.on("allow", allowListener);

		audit.record("file", "/a.txt", "deny", "test");
		audit.record("env", "API_KEY", "mask", "test");
		audit.record("cli", "echo", "rewrite", "test");
		audit.record("file", "/b.txt", "allow", "test");

		expect(denyListener).toHaveBeenCalledTimes(1);
		expect(maskListener).toHaveBeenCalledTimes(1);
		expect(rewriteListener).toHaveBeenCalledTimes(1);
		expect(allowListener).toHaveBeenCalledTimes(1);
	});
});

describe("createConsoleStorageAdapter", () => {
	it("logs records to console", () => {
		const logs: string[] = [];
		vi.spyOn(console, "log").mockImplementation((msg: string) => {
			logs.push(msg);
		});

		const storage = createConsoleStorageAdapter();

		void storage.store({
			type: "file",
			target: "/test.txt",
			action: "deny",
			timestamp: Date.now(),
			policy: "test",
		});

		expect(logs).toHaveLength(1);
		expect(logs[0]).toContain("file");
		expect(logs[0]).toContain("/test.txt");

		vi.restoreAllMocks();
	});

	it("returns all stored records via getAll", () => {
		const storage = createConsoleStorageAdapter();

		void storage.store({
			type: "file",
			target: "/a.txt",
			action: "deny",
			timestamp: Date.now(),
			policy: "test",
		});
		void storage.store({
			type: "file",
			target: "/b.txt",
			action: "deny",
			timestamp: Date.now(),
			policy: "test",
		});

		const records = storage.getAll();
		expect(records).toHaveLength(2);
	});
});
