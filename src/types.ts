// ─── Settings ───────────────────────────────────────────────────────
export interface AISearchSettings {
	// Search behavior
	maxResults: number;
	showScores: boolean;
	excerptLength: number;
	excerptLines: number;
	enableFuzzySearch: boolean;

	// Indexing
	excludedFolders: string[];
	excludedTags: string[];
	indexOnStartup: boolean;

	// Embeddings (Phase 4)
	enableEmbeddings: boolean;
	embeddingModel: string;
	embeddingBatchSize: number;

	// Claude API (Phase 5)
	claudeApiKey: string;
	enableAI: boolean;
	claudeModel: string;
	maxContextTokens: number;
	requireConsentPerRequest: boolean;

	// Privacy
	auditLogEnabled: boolean;

	// Pinned queries
	pinnedQueries: string[];
	searchHistory: string[];
}

// ─── Index Schema ───────────────────────────────────────────────────
/** The document shape stored in the Orama index */
export interface IndexedNote {
	/** Vault-relative file path, serves as unique ID */
	path: string;
	/** Note title (filename without extension) */
	title: string;
	/** Full markdown content (for full-text search) */
	content: string;
	/** Extracted tags (without # prefix) */
	tags: string[];
	/** Frontmatter properties as flat key-value pairs */
	frontmatter: Record<string, string>;
	/** Parent folder path */
	folder: string;
	/** ISO date string of file creation */
	createdAt: string;
	/** ISO date string of last modification */
	modifiedAt: string;
	/** Headings extracted from the note */
	headings: string[];
	/** Outgoing links (without [[ ]]) */
	outlinks: string[];
	/** Vector embedding (Phase 4 — 384 dimensions for MiniLM) */
	embedding?: number[];
}

// ─── Search ─────────────────────────────────────────────────────────
export interface ParsedQuery {
	/** Free-text search terms */
	text: string;
	/** Exact phrases from "quoted terms" */
	phrases: string[];
	/** Tag filters: #tag1, #tag2 */
	tags: string[];
	/** Negated tag filters: -#tag */
	excludedTags: string[];
	/** Negated text terms: -word */
	excludedTerms: string[];
	/** Folder/path filter: path:folder/subfolder or folder:folder */
	paths: string[];
	/** Heading filter: heading:term */
	headingTerms: string[];
	/** Frontmatter filters: property:value */
	frontmatter: Record<string, string>;
	/** Date range filters */
	dateFilters: DateFilter[];
	/** Whether to use semantic search (requires embeddings) */
	useSemantic: boolean;
}

export interface DateFilter {
	field: "created" | "modified";
	operator: "before" | "after" | "on";
	date: string;
}

export interface SearchResult {
	/** Vault-relative file path */
	path: string;
	/** Note title */
	title: string;
	/** Relevance score (0-1, higher is better) */
	score: number;
	/** Source of the score */
	scoreSource: "text" | "vector" | "hybrid";
	/** Text excerpt with match context */
	excerpt: string;
	/** Matched tags */
	matchedTags: string[];
	/** Folder path */
	folder: string;
	/** File creation date */
	createdAt: string;
	/** File modification date */
	modifiedAt: string;
	/** Positions of matches for highlighting */
	highlights: HighlightRange[];
}

export interface HighlightRange {
	start: number;
	end: number;
}

// ─── Storage ────────────────────────────────────────────────────────
export interface StoredIndex {
	/** Serialized Orama index JSON */
	data: string;
	/** Vault identifier (folder name or path hash) */
	vaultId: string;
	/** When the index was last fully built */
	lastFullBuild: number;
	/** Number of documents in the index */
	documentCount: number;
	/** Schema version for migrations */
	schemaVersion: number;
}

export interface StoredEmbedding {
	/** File path as key */
	path: string;
	/** The embedding vector */
	vector: number[];
	/** Hash of the content that was embedded (to detect changes) */
	contentHash: string;
	/** When the embedding was generated */
	generatedAt: number;
}

// ─── Claude API (Phase 5) ───────────────────────────────────────────
export interface ClaudeRequest {
	/** Unique request ID */
	id: string;
	/** Timestamp */
	timestamp: number;
	/** The user's original query */
	query: string;
	/** Number of context notes sent */
	contextNoteCount: number;
	/** Approximate token count of context */
	contextTokenEstimate: number;
	/** The full prompt sent to Claude */
	prompt: string;
}

export interface ClaudeResponse {
	/** Matching request ID */
	requestId: string;
	/** Timestamp */
	timestamp: number;
	/** The natural language summary */
	summary: string;
	/** Token usage */
	tokensUsed: number;
	/** Whether the user consented */
	consentGiven: boolean;
}

export interface AuditLogEntry {
	request: ClaudeRequest;
	response?: ClaudeResponse;
	error?: string;
}

// ─── UI State ───────────────────────────────────────────────────────
export interface SearchViewState {
	query: string;
	results: SearchResult[];
	isSearching: boolean;
	isIndexing: boolean;
	indexProgress: number;
	embeddingProgress: number;
	aiSummary: string | null;
	error: string | null;
}

// ─── Index Status ───────────────────────────────────────────────────
export interface IndexStatus {
	isReady: boolean;
	documentCount: number;
	lastUpdated: number | null;
	embeddingsAvailable: boolean;
	embeddedDocumentCount: number;
}
