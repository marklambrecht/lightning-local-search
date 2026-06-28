import { TFile } from "obsidian";
import type AISearchPlugin from "../main";
import type { OramaIndex } from "./orama-index";
import type { VaultIndexer } from "./vault-indexer";
import { debounce } from "../utils/debounce";
import { DEBOUNCE_MS } from "../constants";

export class IncrementalSync {
	private pendingUpdates = new Map<string, TFile>();
	private processPending: (() => void) & { cancel(): void };

	constructor(
		private plugin: AISearchPlugin,
		private index: OramaIndex,
		private indexer: VaultIndexer,
		private onIndexChanged?: () => void,
	) {
		this.processPending = debounce(
			() => {
				void this.flushPendingUpdates();
			},
			DEBOUNCE_MS.fileChange,
		);
	}

	register(): void {
		this.plugin.registerEvent(
			this.plugin.app.vault.on("create", (file) => {
				if (file instanceof TFile && this.indexer.isIndexable(file)) {
					this.pendingUpdates.set(file.path, file);
					this.processPending();
				}
			}),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (file instanceof TFile && this.indexer.isIndexable(file)) {
					this.pendingUpdates.set(file.path, file);
					this.processPending();
				}
			}),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("delete", (file) => {
				if (file instanceof TFile) {
					this.pendingUpdates.delete(file.path);
					void this.index.removeDocument(file.path);
					this.onIndexChanged?.();
				}
			}),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile) {
					// The old path may have been indexed under any type; always
					// remove it, then re-add the new path if it's still indexable.
					void this.index.removeDocument(oldPath);
					if (this.indexer.isIndexable(file)) {
						this.pendingUpdates.set(file.path, file);
						this.processPending();
					}
				}
			}),
		);
	}

	/** Cancel any pending debounced flush (call on plugin unload). */
	cancel(): void {
		this.processPending.cancel();
		this.pendingUpdates.clear();
	}

	private async flushPendingUpdates(): Promise<void> {
		const entries = [...this.pendingUpdates.entries()];
		this.pendingUpdates.clear();

		for (const [, file] of entries) {
			const doc = await this.indexer.indexFile(file);
			if (doc) {
				await this.index.upsertDocument(doc);
			}
		}

		if (entries.length > 0) {
			this.onIndexChanged?.();
		}
	}
}
