/**
 * Veil Audit System
 *
 * Enhanced audit trail with event emitters and storage adapters
 */

import type { InterceptRecord, RuleAction } from "./types";

/**
 * Audit event types
 */
export type AuditEventType = "intercept" | "allow" | "deny" | "mask" | "rewrite";

/**
 * Audit event payload
 */
export interface AuditEvent {
	type: AuditEventType;
	record: InterceptRecord;
	timestamp: number;
}

/**
 * Audit event listener
 */
export type AuditEventListener = (event: AuditEvent) => void;

/**
 * Storage adapter interface for persisting audit records
 */
export interface AuditStorageAdapter {
	/** Store a new record */
	store(record: InterceptRecord): void | Promise<void>;
	/** Retrieve all records */
	getAll(): InterceptRecord[] | Promise<InterceptRecord[]>;
	/** Clear all records */
	clear(): void | Promise<void>;
	/** Query records by criteria */
	query?(criteria: AuditQueryCriteria): InterceptRecord[] | Promise<InterceptRecord[]>;
}

/**
 * Query criteria for filtering audit records
 */
export interface AuditQueryCriteria {
	type?: InterceptRecord["type"];
	action?: RuleAction;
	since?: number;
	until?: number;
	target?: string | RegExp;
	limit?: number;
}

/**
 * In-memory storage adapter (default)
 */
export class MemoryStorageAdapter implements AuditStorageAdapter {
	private records: InterceptRecord[] = [];
	private maxRecords: number;

	constructor(options: { maxRecords?: number } = {}) {
		this.maxRecords = options.maxRecords ?? 10000;
	}

	store(record: InterceptRecord): void {
		this.records.push(record);
		// Trim if over limit
		if (this.records.length > this.maxRecords) {
			this.records = this.records.slice(-this.maxRecords);
		}
	}

	getAll(): InterceptRecord[] {
		return [...this.records];
	}

	clear(): void {
		this.records = [];
	}

	query(criteria: AuditQueryCriteria): InterceptRecord[] {
		let results = this.records;

		if (criteria.type !== undefined) {
			results = results.filter((r) => r.type === criteria.type);
		}
		if (criteria.action !== undefined) {
			results = results.filter((r) => r.action === criteria.action);
		}
		if (criteria.since !== undefined) {
			const since = criteria.since;
			results = results.filter((r) => r.timestamp >= since);
		}
		if (criteria.until !== undefined) {
			const until = criteria.until;
			results = results.filter((r) => r.timestamp <= until);
		}
		if (criteria.target !== undefined) {
			if (typeof criteria.target === "string") {
				results = results.filter((r) => r.target === criteria.target);
			} else {
				results = results.filter(
					(r) => criteria.target instanceof RegExp && criteria.target.test(r.target),
				);
			}
		}
		if (criteria.limit !== undefined) {
			results = results.slice(-criteria.limit);
		}

		return results;
	}
}

/**
 * Audit manager with event emitter and storage adapter support
 */
export class AuditManager {
	private storage: AuditStorageAdapter;
	private listeners = new Map<AuditEventType | "*", Set<AuditEventListener>>();

	constructor(storage?: AuditStorageAdapter) {
		this.storage = storage ?? new MemoryStorageAdapter();
	}

	/**
	 * Record an intercepted call
	 */
	record(type: InterceptRecord["type"], target: string, action: RuleAction, policy: string): void {
		const record: InterceptRecord = {
			type,
			target,
			action,
			timestamp: Date.now(),
			policy,
		};

		void this.storage.store(record);
		this.emit(this.actionToEventType(action), record);
	}

	/**
	 * Subscribe to audit events
	 */
	on(eventType: AuditEventType | "*", listener: AuditEventListener): () => void {
		if (!this.listeners.has(eventType)) {
			this.listeners.set(eventType, new Set());
		}
		this.listeners.get(eventType)?.add(listener);

		// Return unsubscribe function
		return () => {
			this.listeners.get(eventType)?.delete(listener);
		};
	}

	/**
	 * Subscribe to an event once
	 */
	once(eventType: AuditEventType | "*", listener: AuditEventListener): () => void {
		const wrappedListener: AuditEventListener = (event) => {
			unsubscribe();
			listener(event);
		};
		const unsubscribe = this.on(eventType, wrappedListener);
		return unsubscribe;
	}

	/**
	 * Remove all listeners for an event type
	 */
	off(eventType: AuditEventType | "*"): void {
		this.listeners.delete(eventType);
	}

	/**
	 * Get all records
	 */
	getAll(): InterceptRecord[] | Promise<InterceptRecord[]> {
		return this.storage.getAll();
	}

	/**
	 * Query records
	 */
	query(criteria: AuditQueryCriteria): InterceptRecord[] | Promise<InterceptRecord[]> {
		if (this.storage.query) {
			return this.storage.query(criteria);
		}
		// Fallback: filter in memory
		const all = this.storage.getAll();
		if (Array.isArray(all)) {
			return this.filterRecords(all, criteria);
		}
		return all.then((records) => this.filterRecords(records, criteria));
	}

	/**
	 * Clear all records
	 */
	clear(): void | Promise<void> {
		return this.storage.clear();
	}

	/**
	 * Get storage adapter
	 */
	getStorage(): AuditStorageAdapter {
		return this.storage;
	}

	/**
	 * Set storage adapter
	 */
	setStorage(storage: AuditStorageAdapter): void {
		this.storage = storage;
	}

	private emit(eventType: AuditEventType, record: InterceptRecord): void {
		const event: AuditEvent = {
			type: eventType,
			record,
			timestamp: record.timestamp,
		};

		// Emit to specific listeners
		this.listeners.get(eventType)?.forEach((listener) => { listener(event); });
		// Emit to wildcard listeners
		this.listeners.get("*")?.forEach((listener) => { listener(event); });
	}

	private actionToEventType(action: RuleAction): AuditEventType {
		switch (action) {
			case "deny":
				return "deny";
			case "mask":
				return "mask";
			case "rewrite":
				return "rewrite";
			case "allow":
				return "allow";
			default:
				return "intercept";
		}
	}

	private filterRecords(
		records: InterceptRecord[],
		criteria: AuditQueryCriteria,
	): InterceptRecord[] {
		let results = records;

		if (criteria.type !== undefined) {
			results = results.filter((r) => r.type === criteria.type);
		}
		if (criteria.action !== undefined) {
			results = results.filter((r) => r.action === criteria.action);
		}
		if (criteria.since !== undefined) {
			const since = criteria.since;
			results = results.filter((r) => r.timestamp >= since);
		}
		if (criteria.until !== undefined) {
			const until = criteria.until;
			results = results.filter((r) => r.timestamp <= until);
		}
		if (criteria.target !== undefined) {
			if (typeof criteria.target === "string") {
				results = results.filter((r) => r.target === criteria.target);
			} else {
				results = results.filter(
					(r) => criteria.target instanceof RegExp && criteria.target.test(r.target),
				);
			}
		}
		if (criteria.limit !== undefined) {
			results = results.slice(-criteria.limit);
		}

		return results;
	}
}

/**
 * Create a console logging storage adapter (for debugging)
 */
export function createConsoleStorageAdapter(): AuditStorageAdapter {
	const memory = new MemoryStorageAdapter();
	return {
		store(record: InterceptRecord): void {
			console.log(
				`[veil:audit] ${record.type} ${record.action} "${record.target}" (${record.policy})`,
			);
			memory.store(record);
		},
		getAll(): InterceptRecord[] {
			return memory.getAll();
		},
		clear(): void {
			memory.clear();
		},
		query(criteria: AuditQueryCriteria): InterceptRecord[] {
			return memory.query(criteria);
		},
	};
}
