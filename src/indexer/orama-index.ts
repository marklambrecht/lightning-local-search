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
		const hasFileTerms = query.fileTerms.length > 0;
		const hasHeadingTerms = query.headingTerms.length > 0;
		const hasLineQueries = query.lineQueries.length > 0;
		const hasSectionQueries = query.sectionQueries.length > 0;
		const hasFrontmatter = Object.keys(query.frontmatter).length > 0;

		// Build Orama where clause (tags + dates only; paths use post-filter)
		const whereClause = this.buildWhereClause(query);

		// For phrase searches, send all meaningful words from each phrase to Orama
		// so the candidate set is broad enough. The post-filter handles exact
		// phrase matching; we just need Orama to return relevant documents.
		// Words ≤2 chars are skipped because Orama's English tokenizer typically
		// drops them anyway (stemmer minimum token length).
		let searchTerm: string;
		if (hasPhrases) {
			const wordsPerPhrase = query.phrases.map((phrase) =>
				phrase.split(/\s+/).filter((w) => w.length > 2).join(" "),
			);
			searchTerm = [query.text, ...wordsPerPhrase]
				.filter(Boolean)
				.join(" ")
				.trim();
		} else {
			searchTerm = query.text;
		}

		// Feed filter terms into the search term so Orama returns candidate docs.
		// Post-filters handle the precision (same-line, same-section, exact title, etc.).
		const extraTerms: string[] = [];
		if (hasLineQueries) extraTerms.push(...query.lineQueries.flat());
		if (hasSectionQueries) extraTerms.push(...query.sectionQueries.flat());
		if (hasFileTerms) extraTerms.push(...query.fileTerms);
		if (hasHeadingTerms) extraTerms.push(...query.headingTerms);
		if (extraTerms.length > 0) {
			searchTerm = [searchTerm, ...extraTerms].filter(Boolean).join(" ").trim();
		}

		const hasFiltersOnly = searchTerm.length === 0 && (Object.keys(whereClause).length > 0
			|| hasPaths || hasFrontmatter);
		if (hasFiltersOnly) searchTerm = "";
		const where = Object.keys(whereClause).length > 0 ? whereClause : undefined;

		// Orama uses OR matching (any term matches) with BM25 ranking.
		// We need a large candidate pool because post-filtering enforces
		// AND matching and other constraints. 1000 is cheap — BM25 scoring
		// is fast and the real cost is in the post-filters that follow.
		const searchLimit = 1000;

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

		// Only enable fuzzy if every word in the query is long enough (>4 chars)
		// to avoid false matches on short words like "Novo" matching "Note".
		const searchWords = searchTerm.split(/\s+/).filter((w) => w.length > 0);
		const useFuzzy = fuzzy && !hasPhrases && searchWords.length > 0
			&& searchWords.every((w) => w.length > 4);

		// Try exact search first for precision; fall back to fuzzy only if needed
		let results = await search(this.db, {
			...searchOpts,
			tolerance: 0,
		});

		if (results.hits.length === 0 && useFuzzy) {
			results = await search(this.db, {
				...searchOpts,
				tolerance: 1,
			});
		}

		let hits = results.hits;

		// Collect ALL original query words (text + phrases) for AND filtering
		// and title promotion. Checked against raw text, not stemmed tokens,
		// so short words like "CA" work correctly.
		const allQueryWords = [
			...query.text.split(/\s+/),
			...query.phrases.flatMap((p) => p.split(/\s+/)),
		].filter((w) => w.length > 0);

		// All post-filters below enforce AND semantics, so a hit must satisfy
		// every active one. Running them as separate passes meant rebuilding and
		// re-lowercasing the full `title + content + headings` haystack (the note
		// body can be large) once per filter, per hit, on every keystroke.
		//
		// Instead, precompute the lowercased query needles once, then run a
		// single filter pass that builds each document's haystack at most once
		// (lazily, and lowercased at most once) and reuses it across checks.
		const andActive = allQueryWords.length > 1;
		const andNeedles = andActive
			? allQueryWords.map((w) => (caseSensitive ? w : w.toLowerCase()))
			: [];
		const phraseNeedles = hasPhrases
			? query.phrases.map((p) => {
					const n = p.replace(/\s+/g, " ");
					return caseSensitive ? n : n.toLowerCase();
				})
			: [];
		const caseTextTerms = caseSensitive && hasTextTerms
			? query.text.split(/\s+/).filter((t) => t.length > 0)
			: [];
		const excludedNeedles = hasExcludedTerms
			? query.excludedTerms.map((t) => t.toLowerCase())
			: [];
		const fileNeedles = hasFileTerms
			? query.fileTerms.map((t) => (caseSensitive ? t : t.toLowerCase()))
			: [];
		const headingNeedles = hasHeadingTerms
			? query.headingTerms.map((t) => (caseSensitive ? t : t.toLowerCase()))
			: [];
		const lineNeedles = hasLineQueries
			? query.lineQueries.map((terms) =>
					terms.map((t) => (caseSensitive ? t : t.toLowerCase())),
				)
			: [];
		const sectionNeedles = hasSectionQueries
			? query.sectionQueries.map((terms) =>
					terms.map((t) => (caseSensitive ? t : t.toLowerCase())),
				)
			: [];
		const frontmatterEntries = hasFrontmatter
			? Object.entries(query.frontmatter).map(
					([k, v]) => [k.toLowerCase(), v.toLowerCase()] as const,
				)
			: [];

		const needsPostFilter = andActive || hasPaths || hasPhrases
			|| caseTextTerms.length > 0 || hasExcludedTerms || hasExcludedTags
			|| hasFileTerms || hasHeadingTerms || hasLineQueries
			|| hasSectionQueries || hasFrontmatter;

		if (needsPostFilter) {
			hits = hits.filter((hit) => {
				const doc = hit.document as unknown as OramaDocument;

				// Build the title+content+headings haystack once per hit; the
				// lowercased form is computed at most once and only when needed.
				const rawHaystack = `${doc.title} ${doc.content} ${doc.headings.join(" ")}`;
				let lowerHaystack: string | null = null;
				const lower = () =>
					(lowerHaystack ??= rawHaystack.toLowerCase());

				// AND semantics: every query word must appear somewhere.
				if (andActive) {
					const hay = caseSensitive ? rawHaystack : lower();
					if (!andNeedles.every((w) => hay.includes(w))) return false;
				}

				// Path prefix matching (supports subfolders).
				if (hasPaths) {
					const docPath = doc.path.toLowerCase();
					const docFolder = doc.folder?.toLowerCase() ?? "";
					const ok = query.paths.some((filterPath) => {
						const fp = filterPath.toLowerCase();
						return (
							docFolder === fp ||
							docFolder.startsWith(fp + "/") ||
							docPath.startsWith(fp + "/") ||
							docPath.startsWith(fp)
						);
					});
					if (!ok) return false;
				}

				// Exact phrase matches (whitespace collapsed).
				if (hasPhrases) {
					const collapsed = rawHaystack.replace(/\s+/g, " ");
					const searchable = caseSensitive ? collapsed : collapsed.toLowerCase();
					if (!phraseNeedles.every((p) => searchable.includes(p))) return false;
				}

				// Case-sensitive matching for regular search terms.
				if (caseTextTerms.length > 0) {
					if (!caseTextTerms.every((term) => rawHaystack.includes(term))) return false;
				}

				// Negated terms — exclude results containing these words.
				if (hasExcludedTerms) {
					const hay = lower();
					if (excludedNeedles.some((t) => hay.includes(t))) return false;
				}

				// Negated tags — exclude results that have these tags.
				if (hasExcludedTags) {
					const ok = query.excludedTags.every(
						(tag) => !doc.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
					);
					if (!ok) return false;
				}

				// File name terms — filename must contain every term.
				if (hasFileTerms) {
					const docTitle = caseSensitive ? doc.title : doc.title.toLowerCase();
					if (!fileNeedles.every((t) => docTitle.includes(t))) return false;
				}

				// Heading terms — some heading must contain each term.
				if (hasHeadingTerms) {
					const headings = caseSensitive
						? doc.headings
						: doc.headings.map((h) => h.toLowerCase());
					const ok = headingNeedles.every((t) =>
						headings.some((h) => h.includes(t)),
					);
					if (!ok) return false;
				}

				// Line queries — all terms in each group on the same line.
				if (hasLineQueries) {
					const rawLines = doc.content.split("\n");
					const lines = caseSensitive
						? rawLines
						: rawLines.map((l) => l.toLowerCase());
					const ok = lineNeedles.every((terms) =>
						lines.some((line) => terms.every((t) => line.includes(t))),
					);
					if (!ok) return false;
				}

				// Section queries — all terms under the same heading section.
				if (hasSectionQueries) {
					const rawSections = doc.content.split(/^(?=#{1,6} )/m);
					const sections = caseSensitive
						? rawSections
						: rawSections.map((s) => s.toLowerCase());
					const ok = sectionNeedles.every((terms) =>
						sections.some((section) => terms.every((t) => section.includes(t))),
					);
					if (!ok) return false;
				}

				// Frontmatter property matches.
				if (hasFrontmatter) {
					const fm = doc.frontmatter.toLowerCase();
					const ok = frontmatterEntries.every(([key, value]) => {
						if (value === "") return fm.includes(`${key}:`);
						return fm.includes(`${key}:${value}`);
					});
					if (!ok) return false;
				}

				return true;
			});
		}

		// Title-match guarantee: promote hits whose title contains ALL
		// original query words so they are never pushed out by the limit.
		const queryWords = allQueryWords.map((w) => w.toLowerCase());
		if (queryWords.length > 0) {
			const titleHits: typeof hits = [];
			const otherHits: typeof hits = [];
			for (const hit of hits) {
				const title = (hit.document as unknown as OramaDocument).title.toLowerCase();
				if (queryWords.every((w) => title.includes(w))) {
					titleHits.push(hit);
				} else {
					otherHits.push(hit);
				}
			}
			hits = [...titleHits, ...otherHits];
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

	/** Check if a file path exists in the index (for diagnostics) */
	hasDocument(path: string): boolean {
		return this.pathToId.has(path);
	}

	get documentCount(): number {
		if (!this.db) return 0;
		return count(this.db);
	}

	get isReady(): boolean {
		return this.db !== null;
	}
}
