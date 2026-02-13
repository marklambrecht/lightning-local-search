import type { App, TFile, CachedMetadata } from "obsidian";
import type { IndexableDocument } from "./orama-index";
import { stripMarkdown } from "../utils/text-processing";

export class VaultIndexer {
	constructor(
		private app: App,
		private excludedFolders: string[],
		private excludedTags: string[] = [],
	) {}

	/** Number of indexable markdown files in the vault */
	getFileCount(): number {
		return this.getIndexableFiles().length;
	}

	async indexAll(
		onProgress?: (current: number, total: number) => void,
	): Promise<IndexableDocument[]> {
		const files = this.getIndexableFiles();
		const notes: IndexableDocument[] = [];
		const BATCH_SIZE = 50;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file) {
				const note = await this.indexFile(file);
				if (note) notes.push(note);
			}
			onProgress?.(i + 1, files.length);

			// Yield to the main thread every BATCH_SIZE files
			// to allow GC and prevent iOS watchdog kills
			if ((i + 1) % BATCH_SIZE === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		return notes;
	}

	/**
	 * Stream-indexes files one at a time, passing each document to the
	 * callback immediately so it can be inserted into the index and then
	 * garbage-collected. This keeps peak memory low on mobile.
	 */
	async indexAllStreaming(
		onDocument: (doc: IndexableDocument) => Promise<void>,
		onProgress?: (current: number, total: number) => void,
	): Promise<number> {
		const files = this.getIndexableFiles();
		const BATCH_SIZE = 50;
		let docCount = 0;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file) {
				const doc = await this.indexFile(file);
				if (doc) {
					await onDocument(doc);
					docCount++;
				}
			}
			onProgress?.(i + 1, files.length);

			if ((i + 1) % BATCH_SIZE === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		return docCount;
	}

	async indexFile(file: TFile): Promise<IndexableDocument | null> {
		if (this.isExcluded(file)) return null;

		const content = await this.app.vault.cachedRead(file);
		const metadata = this.app.metadataCache.getFileCache(file);

		const tags = this.extractTags(metadata);

		// Skip notes that have any excluded tag
		if (this.excludedTags.length > 0 && tags.some((t) => this.excludedTags.includes(t))) {
			return null;
		}

		return {
			path: file.path,
			title: file.basename,
			content: stripMarkdown(content),
			tags,
			folder: file.parent?.path ?? "",
			headings: this.extractHeadings(metadata),
			createdAt: file.stat.ctime,
			modifiedAt: file.stat.mtime,
			frontmatter: this.extractFrontmatter(metadata),
		};
	}

	updateExcludedFolders(folders: string[]): void {
		this.excludedFolders = folders;
	}

	updateExcludedTags(tags: string[]): void {
		this.excludedTags = tags;
	}

	private getIndexableFiles(): TFile[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => !this.isExcluded(f));
	}

	private isExcluded(file: TFile): boolean {
		return this.excludedFolders.some(
			(folder) =>
				file.path.startsWith(folder + "/") || file.path === folder,
		);
	}

	private extractTags(metadata: CachedMetadata | null): string[] {
		if (!metadata) return [];
		const tags = new Set<string>();

		// Inline tags from body
		if (metadata.tags) {
			for (const tagCache of metadata.tags) {
				// tagCache.tag includes the # prefix
				tags.add(tagCache.tag.replace(/^#/, ""));
			}
		}

		// Frontmatter tags
		if (metadata.frontmatter?.["tags"]) {
			const fmTags = metadata.frontmatter["tags"];
			if (Array.isArray(fmTags)) {
				for (const t of fmTags) {
					if (typeof t === "string") {
						tags.add(t.replace(/^#/, ""));
					}
				}
			} else if (typeof fmTags === "string") {
				tags.add(fmTags.replace(/^#/, ""));
			}
		}

		return [...tags];
	}

	private extractHeadings(metadata: CachedMetadata | null): string[] {
		if (!metadata?.headings) return [];
		return metadata.headings.map((h) => h.heading);
	}

	private extractFrontmatter(metadata: CachedMetadata | null): string {
		if (!metadata?.frontmatter) return "";
		const pairs: string[] = [];
		for (const [key, value] of Object.entries(metadata.frontmatter)) {
			if (key === "position" || key === "tags") continue;
			if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
				pairs.push(`${key}:${String(value)}`);
			}
		}
		return pairs.join("\n");
	}
}
