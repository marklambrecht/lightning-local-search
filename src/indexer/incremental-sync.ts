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
				if (file instanceof TFile && file.extension === "md") {
					this.pendingUpdates.set(file.path, file);
					this.processPending();
				}
			}),
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
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
				if (file instanceof TFile && file.extension === "md") {
					void this.index.removeDocument(oldPath);
					this.pendingUpdates.set(file.path, file);
					this.processPending();
				}
			}),
		);
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
