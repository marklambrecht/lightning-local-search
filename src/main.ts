import { Notice, Platform, Plugin } from "obsidian";
import type { AISearchSettings } from "./types";
import { COMMAND_IDS, DEFAULT_SETTINGS, VIEW_TYPE_AI_SEARCH } from "./constants";
import { AISearchSettingTab } from "./settings";
import { OramaIndex } from "./indexer/orama-index";
import { VaultIndexer } from "./indexer/vault-indexer";
import { IncrementalSync } from "./indexer/incremental-sync";
import { IndexStore } from "./storage/index-store";
import { CacheManager } from "./storage/cache-manager";
import { SearchModal } from "./ui/search-modal";
import { AISearchView } from "./ui/search-view";
import { AuditLog } from "./claude/audit-log";
import { EmbeddingService } from "./embeddings/embedding-service";
import { EmbeddingWorker } from "./embeddings/embedding-worker";
import { debounce } from "./utils/debounce";

const PERSIST_DEBOUNCE_MS = 30_000;

export default class AISearchPlugin extends Plugin {
	settings: AISearchSettings = { ...DEFAULT_SETTINGS };
	oramaIndex: OramaIndex = new OramaIndex();
	auditLog: AuditLog | null = null;

	private vaultIndexer!: VaultIndexer;
	private incrementalSync!: IncrementalSync;
	private indexStore!: IndexStore;
	private cacheManager!: CacheManager;
	private embeddingService: EmbeddingService | null = null;
	private embeddingWorker: EmbeddingWorker | null = null;
	private debouncedPersist: (() => void) & { cancel(): void } = Object.assign(() => {}, { cancel: () => {} });

	async onload(): Promise<void> {
		await this.loadSettings();

		// Register view type early so Obsidian can restore it from layout
		this.registerView(
			VIEW_TYPE_AI_SEARCH,
			(leaf) => new AISearchView(leaf, this),
		);

		// Settings tab
		this.addSettingTab(new AISearchSettingTab(this.app, this));

		// Ribbon icon
		this.addRibbonIcon("search", "Lightning Local Search", () => {
			this.openSearchModal();
		});

		// Commands
		this.addCommand({
			id: COMMAND_IDS.openSearch,
			name: "Open search",
			callback: () => this.openSearchModal(),
		});

		this.addCommand({
			id: COMMAND_IDS.openSidebar,
			name: "Open search sidebar",
			callback: () => void this.activateSidebarView(),
		});

		this.addCommand({
			id: COMMAND_IDS.openTab,
			name: "Open search in tab",
			callback: () => void this.activateTabView(),
		});

		this.addCommand({
			id: COMMAND_IDS.reindex,
			name: "Re-index vault",
			callback: () => void this.triggerReindex(),
		});

		// Deferred initialization
		this.app.workspace.onLayoutReady(() => {
			void this.initializeServices();
		});
	}

	onunload(): void {
		// Flush any pending index persist before unloading (desktop only)
		this.debouncedPersist.cancel();
		if (!Platform.isMobile) {
			void this.cacheManager?.persistIndex();
		}

		this.incrementalSync = undefined as unknown as IncrementalSync;
		this.embeddingWorker?.cancel();
		this.embeddingService?.dispose();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<AISearchSettings> | undefined,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async initializeServices(): Promise<void> {
		this.vaultIndexer = new VaultIndexer(
			this.app,
			this.settings.excludedFolders,
			this.settings.excludedTags,
		);
		this.indexStore = new IndexStore();

		const vaultId = IndexStore.getVaultId(this.app.vault.getName());
		this.cacheManager = new CacheManager(
			this.oramaIndex,
			this.vaultIndexer,
			this.indexStore,
			vaultId,
		);

		// Initialize index (load from cache or rebuild)
		if (this.settings.indexOnStartup) {
			const status = await this.cacheManager.initialize();
			new Notice(`Lightning Local Search: indexed ${status.documentCount} notes`);
		}

		// Debounced persist — serializes the full index to IndexedDB.
		// Using a long debounce (30s) prevents main-thread freezes from
		// JSON.stringify on every keystroke-triggered file save.
		// Disabled on mobile — serializing the index causes OOM crashes.
		if (!Platform.isMobile) {
			this.debouncedPersist = debounce(() => {
				void this.cacheManager.persistIndex();
			}, PERSIST_DEBOUNCE_MS);
		}

		// Register file watchers for incremental sync
		this.incrementalSync = new IncrementalSync(
			this,
			this.oramaIndex,
			this.vaultIndexer,
			() => {
				this.debouncedPersist();
			},
		);
		this.incrementalSync.register();

		// Initialize audit log (Phase 5)
		if (this.settings.auditLogEnabled) {
			this.auditLog = new AuditLog();
		}

		// Initialize embedding service (Phase 4 — desktop only)
		if (this.settings.enableEmbeddings) {
			this.embeddingService = new EmbeddingService();
			if (this.embeddingService.isAvailable) {
				await this.embeddingService.initialize(
					this.settings.embeddingModel,
				);
				this.embeddingWorker = new EmbeddingWorker(
					this.app,
					this.embeddingService,
					this.indexStore,
					this.settings.embeddingBatchSize,
				);
				void this.embeddingWorker.processAll();
			}
		}
	}

	private openSearchModal(): void {
		new SearchModal(
			this.app,
			this.oramaIndex,
			this.settings.maxResults,
			this.settings.showScores,
			this.settings.excerptLength,
			this.settings.enableFuzzySearch,
		).open();
	}

	private async activateSidebarView(): Promise<void> {
		const existing =
			this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_SEARCH);
		if (existing.length > 0 && existing[0]) {
			await this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_AI_SEARCH,
				active: true,
			});
			await this.app.workspace.revealLeaf(leaf);
		}
	}

	private async activateTabView(): Promise<void> {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_AI_SEARCH,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	private async triggerReindex(): Promise<void> {
		new Notice("Re-indexing vault...");
		const status = await this.cacheManager.fullRebuild();
		new Notice(`Indexed ${status.documentCount} notes`);
	}
}
