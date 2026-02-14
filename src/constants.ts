import type { AISearchSettings } from "./types";

export const VIEW_TYPE_AI_SEARCH = "ai-search-view";

export const COMMAND_IDS = {
	openSearch: "open-ai-search",
	openSidebar: "open-ai-search-sidebar",
	openTab: "open-ai-search-tab",
	reindex: "reindex-vault",
} as const;

export const INDEX_SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: AISearchSettings = {
	maxResults: 20,
	showScores: false,
	excerptLength: 300,
	excerptLines: 4,
	enableFuzzySearch: true,
	excludedFolders: [],
	excludedTags: [],
	indexOnStartup: true,
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
