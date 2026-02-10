import {
	create,
	insert,
	remove,
	search,
	save,
	load,
	count,
	type AnyOrama,
	type RawData,
} from "@orama/orama";
import type { ParsedQuery, SearchResult } from "../types";
import { generatePreviewExcerpt } from "../utils/text-processing";

const SCHEMA = {
	title: "string" as const,
	content: "string" as const,
	headings: "string[]" as const,
	path: "enum" as const,
	tags: "enum[]" as const,
	folder: "enum" as const,
	createdAt: "number" as const,
	modifiedAt: "number" as const,
};

/** Document shape matching the schema for insert operations */
interface OramaDocument {
	title: string;
	content: string;
	headings: string[];
	path: string;
	tags: string[];
	folder: string;
	createdAt: number;
	modifiedAt: number;
}

export interface IndexableDocument {
	path: string;
	title: string;
	content: string;
	tags: string[];
	folder: string;
	headings: string[];
	createdAt: number;
	modifiedAt: number;
}

export class OramaIndex {
	private db: AnyOrama | null = null;
	private pathToId = new Map<string, string>();

	async initialize(): Promise<void> {
		this.db = await create({ schema: SCHEMA, language: "english" });
		this.pathToId.clear();
	}

	async loadFromSnapshot(raw: RawData, pathMap: Record<string, string>): Promise<void> {
		if (!this.db) {
			this.db = await create({ schema: SCHEMA, language: "english" });
		}
		load(this.db, raw);
		this.pathToId = new Map(Object.entries(pathMap));
	}

	serialize(): { raw: RawData; pathMap: Record<string, string> } | null {
		if (!this.db) return null;
		const raw = save(this.db);
		const pathMap = Object.fromEntries(this.pathToId);
		return { raw, pathMap };
	}

	async upsertDocument(doc: IndexableDocument): Promise<void> {
		if (!this.db) return;

		// Remove existing if present
		const existingId = this.pathToId.get(doc.path);
		if (existingId) {
			try {
				await remove(this.db, existingId);
			} catch {
				// Document may have already been removed
			}
		}

		const oramaDoc: OramaDocument = {
			title: doc.title,
			content: doc.content,
			headings: doc.headings,
			path: doc.path,
			tags: doc.tags,
			folder: doc.folder,
			createdAt: doc.createdAt,
			modifiedAt: doc.modifiedAt,
		};

		const id = await insert(this.db, oramaDoc);
		this.pathToId.set(doc.path, id);
	}

	async removeDocument(path: string): Promise<void> {
		if (!this.db) return;
		const id = this.pathToId.get(path);
		if (id) {
			try {
				await remove(this.db, id);
			} catch {
				// Already removed
			}
			this.pathToId.delete(path);
		}
	}

	async search(query: ParsedQuery, limit: number, excerptLength: number, fuzzy = true): Promise<SearchResult[]> {
		if (!this.db) return [];

		const whereClause = this.buildWhereClause(query);
		const hasFiltersOnly = query.text.length === 0 && Object.keys(whereClause).length > 0;

		// If there's no text term but there are filters, do a broad search
		const searchTerm = hasFiltersOnly ? "" : query.text;

		const results = await search(this.db, {
			term: searchTerm,
			tolerance: fuzzy && searchTerm.length > 4 ? 1 : 0,
			properties: ["title", "content", "headings"],
			limit,
			where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
			boost: {
				title: 3,
				headings: 2,
				content: 1,
			},
		});

		return results.hits.map((hit) => {
			const doc = hit.document as unknown as OramaDocument;
			return {
				path: doc.path,
				title: doc.title,
				score: hit.score,
				scoreSource: "text" as const,
				excerpt: generatePreviewExcerpt(doc.content, excerptLength),
				matchedTags: doc.tags,
				folder: doc.folder,
				createdAt: new Date(doc.createdAt).toISOString(),
				modifiedAt: new Date(doc.modifiedAt).toISOString(),
				highlights: [],
			};
		});
	}

	private buildWhereClause(query: ParsedQuery): Record<string, unknown> {
		const where: Record<string, unknown> = {};

		if (query.tags.length > 0) {
			where["tags"] = { containsAll: query.tags };
		}

		if (query.paths.length === 1) {
			where["folder"] = { eq: query.paths[0] };
		} else if (query.paths.length > 1) {
			where["folder"] = { in: query.paths };
		}

		for (const filter of query.dateFilters) {
			const field = filter.field === "created" ? "createdAt" : "modifiedAt";
			const timestamp = new Date(filter.date).getTime();
			if (filter.operator === "after") {
				where[field] = { gt: timestamp };
			} else if (filter.operator === "before") {
				where[field] = { lt: timestamp };
			} else {
				// "on" - match the full day
				const dayStart = new Date(filter.date).setHours(0, 0, 0, 0);
				const dayEnd = new Date(filter.date).setHours(23, 59, 59, 999);
				where[field] = { between: [dayStart, dayEnd] };
			}
		}

		return where;
	}

	get documentCount(): number {
		if (!this.db) return 0;
		return count(this.db);
	}

	get isReady(): boolean {
		return this.db !== null;
	}
}
