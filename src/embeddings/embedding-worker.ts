import type { App, TFile } from "obsidian";
import type { EmbeddingService } from "./embedding-service";
import type { IndexStore } from "../storage/index-store";
import type { StoredEmbedding } from "../types";
import { contentHash, stripMarkdown, chunkContent } from "../utils/text-processing";

export class EmbeddingWorker {
	private isRunning = false;
	private shouldCancel = false;

	constructor(
		private app: App,
		private embeddingService: EmbeddingService,
		private store: IndexStore,
		private batchSize: number,
	) {}

	get running(): boolean {
		return this.isRunning;
	}

	async processAll(
		onProgress?: (current: number, total: number) => void,
	): Promise<void> {
		if (this.isRunning) return;
		this.isRunning = true;
		this.shouldCancel = false;

		try {
			const files = this.app.vault.getMarkdownFiles();
			const total = files.length;
			let processed = 0;

			for (let i = 0; i < files.length; i += this.batchSize) {
				if (this.shouldCancel) break;

				const batch = files.slice(i, i + this.batchSize);
				await this.processBatch(batch);

				processed += batch.length;
				onProgress?.(processed, total);

				// Yield to main thread between batches
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		} finally {
			this.isRunning = false;
		}
	}

	cancel(): void {
		this.shouldCancel = true;
	}

	private async processBatch(files: TFile[]): Promise<void> {
		for (const file of files) {
			if (this.shouldCancel) return;

			const content = await this.app.vault.cachedRead(file);
			const hash = contentHash(content);

			// Check if we already have a fresh embedding
			const existing = await this.store.loadEmbedding(file.path);
			if (existing && existing.contentHash === hash) {
				continue;
			}

			const cleanText = stripMarkdown(content);
			const chunks = chunkContent(cleanText, 2000);
			const firstChunk = chunks[0] ?? cleanText.slice(0, 2000);

			if (firstChunk.trim().length === 0) continue;

			const vector = await this.embeddingService.embed(firstChunk);

			const embedding: StoredEmbedding = {
				path: file.path,
				vector,
				contentHash: hash,
				generatedAt: Date.now(),
			};

			await this.store.saveEmbedding(embedding);
		}
	}
}
