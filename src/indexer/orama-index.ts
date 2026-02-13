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
	frontmatter: "string" as const,
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
	frontmatter: string;
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
	frontmatter: string;
}

export class OramaIndex {
	private db: AnyOrama | null = null;
	private pathToId = new Map<string, string>();
	private knownTags = new Set<string>();
	private knownFolders = new Set<string>();

	async initialize(): Promise<void> {
		this.db = await create({ schema: SCHEMA, language: "english" });
		this.pathToId.clear();
		this.knownTags.clear();
		this.knownFolders.clear();
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

		// Track known tags and folders for auto-suggest
		for (const tag of doc.tags) this.knownTags.add(tag);
		if (doc.folder) this.knownFolders.add(doc.folder);

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
			frontmatter: doc.frontmatter,
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

	async search(query: ParsedQuery, limit: number, excerptLength: number, fuzzy = true, caseSensitive = false): Promise<SearchResult[]> {
		if (!this.db) return [];

		const hasPhrases = query.phrases.length > 0;
		const hasPaths = query.paths.length > 0;
		const hasTextTerms = query.text.trim().length > 0;
		const hasExcludedTerms = query.excludedTerms.length > 0;
		const hasExcludedTags = query.excludedTags.length > 0;
		const hasHeadingTerms = query.headingTerms.length > 0;
		const hasFrontmatter = Object.keys(query.frontmatter).length > 0;
		const needsPostFilter = hasPhrases || hasPaths || (caseSensitive && hasTextTerms)
			|| hasExcludedTerms || hasExcludedTags || hasHeadingTerms || hasFrontmatter;

		// Build Orama where clause (tags + dates only; paths use post-filter)
		const whereClause = this.buildWhereClause(query);

		// For phrase searches, send only the longest word from each phrase to Orama
		// (the English tokenizer strips stop words and mis-stems non-English words).
		// The post-filter handles exact phrase matching.
		let searchTerm: string;
		if (hasPhrases) {
			const longestPerPhrase = query.phrases.map((phrase) => {
				const words = phrase.split(/\s+/).filter((w) => w.length > 2);
				words.sort((a, b) => b.length - a.length);
				return words[0] ?? "";
			});
			searchTerm = [query.text, ...longestPerPhrase]
				.filter(Boolean)
				.join(" ")
				.trim();
		} else {
			searchTerm = query.text;
		}

		const hasFiltersOnly = searchTerm.length === 0 && (Object.keys(whereClause).length > 0 || hasPaths || hasHeadingTerms || hasFrontmatter);
		if (hasFiltersOnly) searchTerm = "";
		const where = Object.keys(whereClause).length > 0 ? whereClause : undefined;

		// Request extra results when post-filtering will be applied
		const searchLimit = needsPostFilter ? limit * 10 : limit;

		const searchOpts = {
			term: searchTerm,
			properties: ["title", "content", "headings"],
			limit: searchLimit,
			where,
			boost: {
				title: 3,
				headings: 2,
				content: 1,
			},
		};

		// Force exact matching when phrases are present; otherwise try fuzzy first
		const useFuzzy = fuzzy && !hasPhrases && searchTerm.length > 4;

		let results = await search(this.db, {
			...searchOpts,
			tolerance: useFuzzy ? 1 : 0,
		});

		if (results.hits.length === 0 && useFuzzy) {
			results = await search(this.db, {
				...searchOpts,
				tolerance: 0,
			});
		}

		let hits = results.hits;

		// Post-filter: path prefix matching (supports subfolders)
		if (hasPaths) {
			hits = hits.filter((hit) => {
				const doc = hit.document as unknown as OramaDocument;
				const docPath = doc.path.toLowerCase();
				const docFolder = doc.folder?.toLowerCase() ?? "";
				return query.paths.some((filterPath) => {
					const fp = filterPath.toLowerCase();
					return (
						docFolder === fp ||
						docFolder.startsWith(fp + "/") ||
						docPath.startsWith(fp + "/") ||
						docPath.startsWith(fp.toLowerCase())
					);
				});
			});
		}

		// Post-filter: exact phrase matches
		if (hasPhrases) {
			hits = hits.filter((hit) => {
				const doc = hit.document as unknown as OramaDocument;
				const raw = `${doc.title} ${doc.content} ${doc.headings.join(" ")}`.replace(/\s+/g, " ");
				const searchableText = caseSensitive ? raw : raw.toLowerCase();
				return query.phrases.every((phrase) => {
					const normalized = phrase.replace(/\s+/g, " ");
					return searchableText.includes(caseSensitive ? normalized : normalized.toLowerCase());
				});
			});
		}

		// Post-filter: case-sensitive matching for regular search terms
		if (caseSensitive && hasTextTerms) {
			const terms = query.text.split(/\s+/).filter((t) => t.length > 0);
			hits = hits.filter((hit) => {
				const doc = hit.document as unknown as OramaDocument;
				const searchableText = `${doc.title} ${doc.content} ${doc.headings.join(" ")}`;
				return terms.every((term) => searchableText.includes(term));
			});
		}

		// Post-filter: negated terms — exclude results containing these words
		if (hasExcludedTerms) {
			hits = hits.filter((hit) => {
				const doc = hit.document as unknown as OramaDocument;
				const searchableText = `${doc.title} ${doc.content} ${doc.headings.join(" ")}`.toLowerCase();
				return query.excludedTerms.every(
					(term) => !searchableText.includes(term.toLowerCase()),
				);
			});
		}

		// Post-filter: negated tags — exclude results that have these tags
		if (hasExcludedTags) {
			hits = hits.filter((hit) => {
				const doc = hit.document as unknown as OramaDocument;
				return query.excludedTags.every(
					(tag) => !doc.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
				);
			});
		}

		// Post-filter: heading terms — results must have a heading containing the term
		if (hasHeadingTerms) {
			hits = hits.filter((hit) => {
				const doc = hit.document as unknown as OramaDocument;
				return query.headingTerms.every((term) => {
					const lowerTerm = caseSensitive ? term : term.toLowerCase();
					return doc.headings.some((h) => {
						const heading = caseSensitive ? h : h.toLowerCase();
						return heading.includes(lowerTerm);
					});
				});
			});
		}

		// Post-filter: frontmatter property:value matches
		if (hasFrontmatter) {
			hits = hits.filter((hit) => {
				const doc = hit.document as unknown as OramaDocument;
				const fm = doc.frontmatter.toLowerCase();
				return Object.entries(query.frontmatter).every(([key, value]) => {
					return fm.includes(`${key.toLowerCase()}:${value.toLowerCase()}`);
				});
			});
		}

		return hits.slice(0, limit).map((hit) => {
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

		// Path filtering moved to post-filter for subfolder support

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

	/** Get all unique tags known to the index */
	getAllTags(): string[] {
		return [...this.knownTags].sort();
	}

	/** Get all unique folders known to the index */
	getAllFolders(): string[] {
		return [...this.knownFolders].sort();
	}

	get documentCount(): number {
		if (!this.db) return 0;
		return count(this.db);
	}

	get isReady(): boolean {
		return this.db !== null;
	}
}
