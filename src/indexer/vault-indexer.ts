import type { App, TFile, CachedMetadata } from "obsidian";
import type { IndexableDocument } from "./orama-index";
import { stripMarkdown } from "../utils/text-processing";

export class VaultIndexer {
	constructor(
		private app: App,
		private excludedFolders: string[],
	) {}

	async indexAll(
		onProgress?: (current: number, total: number) => void,
	): Promise<IndexableDocument[]> {
		const files = this.getIndexableFiles();
		const notes: IndexableDocument[] = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			if (file) {
				const note = await this.indexFile(file);
				if (note) notes.push(note);
			}
			onProgress?.(i + 1, files.length);
		}

		return notes;
	}

	async indexFile(file: TFile): Promise<IndexableDocument | null> {
		if (this.isExcluded(file)) return null;

		const content = await this.app.vault.cachedRead(file);
		const metadata = this.app.metadataCache.getFileCache(file);

		return {
			path: file.path,
			title: file.basename,
			content: stripMarkdown(content),
			tags: this.extractTags(metadata),
			folder: file.parent?.path ?? "",
			headings: this.extractHeadings(metadata),
			createdAt: file.stat.ctime,
			modifiedAt: file.stat.mtime,
		};
	}

	updateExcludedFolders(folders: string[]): void {
		this.excludedFolders = folders;
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
}
