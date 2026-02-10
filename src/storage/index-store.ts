import Dexie, { type Table } from "dexie";
import type { StoredIndex, StoredEmbedding } from "../types";
import { INDEX_SCHEMA_VERSION } from "../constants";

class AISearchDatabase extends Dexie {
	indices!: Table<StoredIndex>;
	embeddings!: Table<StoredEmbedding>;

	constructor() {
		super("ai-search-plugin");

		this.version(1).stores({
			indices: "vaultId",
			embeddings: "path, generatedAt",
		});
	}
}

export class IndexStore {
	private db: AISearchDatabase;

	constructor() {
		this.db = new AISearchDatabase();
	}

	async saveIndex(
		vaultId: string,
		data: string,
		documentCount: number,
	): Promise<void> {
		await this.db.indices.put({
			vaultId,
			data,
			lastFullBuild: Date.now(),
			documentCount,
			schemaVersion: INDEX_SCHEMA_VERSION,
		});
	}

	async loadIndex(vaultId: string): Promise<StoredIndex | undefined> {
		const stored = await this.db.indices.get(vaultId);
		if (stored && stored.schemaVersion === INDEX_SCHEMA_VERSION) {
			return stored;
		}
		return undefined;
	}

	async saveEmbedding(embedding: StoredEmbedding): Promise<void> {
		await this.db.embeddings.put(embedding);
	}

	async loadEmbedding(path: string): Promise<StoredEmbedding | undefined> {
		return this.db.embeddings.get(path);
	}

	async deleteEmbedding(path: string): Promise<void> {
		await this.db.embeddings.delete(path);
	}

	async loadAllEmbeddings(): Promise<StoredEmbedding[]> {
		return this.db.embeddings.toArray();
	}

	async clearAll(): Promise<void> {
		await this.db.indices.clear();
		await this.db.embeddings.clear();
	}

	static getVaultId(vaultName: string): string {
		return `vault-${vaultName}`;
	}
}
