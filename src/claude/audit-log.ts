import type { AuditLogEntry, ClaudeRequest, ClaudeResponse } from "../types";

/**
 * Records all Claude API interactions for transparency.
 * Bounded circular buffer stored in plugin data.
 */
export class AuditLog {
	private entries: AuditLogEntry[] = [];
	private maxEntries = 100;

	constructor(existingEntries?: AuditLogEntry[]) {
		if (existingEntries) {
			this.entries = existingEntries;
		}
	}

	recordRequest(request: ClaudeRequest): void {
		this.entries.push({ request });
		this.trim();
	}

	recordResponse(requestId: string, response: ClaudeResponse): void {
		const entry = this.entries.find((e) => e.request.id === requestId);
		if (entry) {
			entry.response = response;
		}
	}

	recordError(requestId: string, error: string): void {
		const entry = this.entries.find((e) => e.request.id === requestId);
		if (entry) {
			entry.error = error;
		}
	}

	getEntries(): readonly AuditLogEntry[] {
		return this.entries;
	}

	serialize(): AuditLogEntry[] {
		return [...this.entries];
	}

	private trim(): void {
		if (this.entries.length > this.maxEntries) {
			this.entries = this.entries.slice(-this.maxEntries);
		}
	}
}
