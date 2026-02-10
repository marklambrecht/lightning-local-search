import type { AISearchSettings } from "./types";

export const VIEW_TYPE_AI_SEARCH = "ai-search-view";

export const COMMAND_IDS = {
	openSearch: "open-ai-search",
	openSidebar: "open-ai-search-sidebar",
	reindex: "reindex-vault",
} as const;

export const INDEX_SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: AISearchSettings = {
	maxResults: 20,
	showScores: false,
	excerptLength: 150,
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
	auditLogEnabled: true,
};

export const DEBOUNCE_MS = {
	fileChange: 2000,
	search: 300,
} as const;
