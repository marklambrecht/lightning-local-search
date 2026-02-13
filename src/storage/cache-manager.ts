import { Platform } from "obsidian";
import type { OramaIndex } from "../indexer/orama-index";
import type { VaultIndexer } from "../indexer/vault-indexer";
import type { IndexStore } from "./index-store";
import type { IndexStatus } from "../types";

/** If the cache has fewer than this fraction of vault files, consider it stale */
const STALE_CACHE_THRESHOLD = 0.8;

export class CacheManager {
	constructor(
		private index: OramaIndex,
		private indexer: VaultIndexer,
		private store: IndexStore,
		private vaultId: string,
	) {}

	async initialize(
		onProgress?: (current: number, total: number) => void,
	): Promise<IndexStatus> {
		try {
			const cached = await this.store.loadIndex(this.vaultId);
			if (cached) {
				// Stale cache detection: if the cached index has significantly
				// fewer documents than the vault, rebuild instead of using it
				const vaultFileCount = this.indexer.getFileCount();
				if (
					vaultFileCount > 0 &&
					cached.documentCount < vaultFileCount * STALE_CACHE_THRESHOLD
				) {
					console.warn(
						`Lightning Local Search: Stale cache (${cached.documentCount} cached vs ${vaultFileCount} vault files), rebuilding`,
					);
				} else {
					const parsed = JSON.parse(cached.data) as {
						raw: unknown;
						pathMap: Record<string, string>;
					};
					await this.index.loadFromSnapshot(
						parsed.raw as Parameters<typeof this.index.loadFromSnapshot>[0],
						parsed.pathMap,
					);
					return {
						isReady: true,
						documentCount: cached.documentCount,
						lastUpdated: cached.lastFullBuild,
						embeddingsAvailable: false,
						embeddedDocumentCount: 0,
					};
				}
			}
		} catch {
			// Cache corrupted or incompatible, fall through to rebuild
			console.warn("Lightning Local Search: Failed to load cached index, rebuilding");
		}

		return this.fullRebuild(onProgress);
	}

	async fullRebuild(
		onProgress?: (current: number, total: number) => void,
	): Promise<IndexStatus> {
		await this.index.initialize();

		// Stream documents directly into Orama one at a time.
		// This avoids holding all documents in memory simultaneously,
		// which is critical on iOS where memory limits are ~100-200MB.
		const docCount = await this.indexer.indexAllStreaming(
			async (doc) => {
				await this.index.upsertDocument(doc);
			},
			onProgress,
		);

		// Skip persist on mobile — JSON.stringify on a large index
		// causes an OOM spike that crashes iOS
		if (!Platform.isMobile) {
			try {
				await this.persistIndex();
			} catch {
				console.warn("Lightning Local Search: Failed to persist index to cache");
			}
		}

		return {
			isReady: true,
			documentCount: docCount,
			lastUpdated: Date.now(),
			embeddingsAvailable: false,
			embeddedDocumentCount: 0,
		};
	}

	async persistIndex(): Promise<void> {
		if (Platform.isMobile) return;
		const serialized = this.index.serialize();
		if (serialized) {
			await this.store.saveIndex(
				this.vaultId,
				JSON.stringify(serialized),
				this.index.documentCount,
			);
		}
	}
}
