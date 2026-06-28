import type { AISearchSettings } from "./types";

export const VIEW_TYPE_AI_SEARCH = "ai-search-view";

export const COMMAND_IDS = {
	openSearch: "open-ai-search",
	openSidebar: "open-ai-search-sidebar",
	openTab: "open-ai-search-tab",
	reindex: "reindex-vault",
} as const;

// Bumped to 3 when non-markdown files (plain text, canvas, PDF) were added to
// the index — older caches lack a `fileType` field and must be rebuilt.
export const INDEX_SCHEMA_VERSION = 3;

/**
 * Extensions indexed as plain text (read verbatim, no markdown stripping and
 * no metadata cache). Source-code extensions are deliberately omitted to avoid
 * surprising users with huge indexes; markdown and canvas are handled
 * separately, and PDFs go through the dedicated extractor.
 */
export const PLAINTEXT_EXTENSIONS = new Set([
	"txt", "text", "csv", "tsv", "log",
	"json", "jsonc", "xml", "yaml", "yml", "ini", "toml",
]);

/**
 * Hard cap on extracted text stored per non-markdown document. A 5 MB PDF or
 * text file can yield millions of characters; storing that verbatim in the
 * in-memory index would dwarf typical notes, so we truncate.
 */
export const MAX_EXTRACTED_CHARS = 500_000;

export const DEFAULT_SETTINGS: AISearchSettings = {
	maxResults: 20,
	showScores: false,
	excerptLength: 300,
	excerptLines: 4,
	enableFuzzySearch: true,
	excludedFolders: [],
	excludedTags: [],
	indexOnStartup: true,
	indexPlainText: true,
	indexCanvas: true,
	indexPdf: false,
	maxIndexFileSizeMB: 5,
	enableEmbeddings: false,
	embeddingModel: "Xenova/all-MiniLM-L6-v2",
	embeddingBatchSize: 10,
	claudeApiKey: "",
	enableAI: false,
	claudeModel: "claude-sonnet-4-5-20250929",
	maxContextTokens: 4000,
	requireConsentPerRequest: true,
	aiExcludedFolders: [],
	auditLogEnabled: true,
	pinnedQueries: [],
	searchHistory: [],
};

export const MAX_SEARCH_HISTORY = 15;

export const RESERVED_PREFIXES = new Set([
	"path", "folder", "created", "modified", "title", "heading",
	"file", "tag", "line", "section",
]);

export const DEBOUNCE_MS = {
	fileChange: 2000,
	search: 300,
} as const;
