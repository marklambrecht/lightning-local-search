import type { OramaIndex } from "../indexer/orama-index";
import type { VaultIndexer } from "../indexer/vault-indexer";
import type { IndexStore } from "./index-store";
import type { IndexStatus } from "../types";

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
		} catch {
			// Cache corrupted or incompatible, fall through to rebuild
			console.warn("AI Search: Failed to load cached index, rebuilding");
		}

		return this.fullRebuild(onProgress);
	}

	async fullRebuild(
		onProgress?: (current: number, total: number) => void,
	): Promise<IndexStatus> {
		await this.index.initialize();
		const notes = await this.indexer.indexAll(onProgress);

		for (const note of notes) {
			await this.index.upsertDocument(note);
		}

		await this.persistIndex();

		return {
			isReady: true,
			documentCount: notes.length,
			lastUpdated: Date.now(),
			embeddingsAvailable: false,
			embeddedDocumentCount: 0,
		};
	}

	async persistIndex(): Promise<void> {
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
