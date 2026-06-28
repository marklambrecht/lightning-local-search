import { Platform, type App, type TFile, type CachedMetadata } from "obsidian";
import type { IndexableDocument } from "./orama-index";
import type { FileType } from "../types";
import { stripMarkdown } from "../utils/text-processing";
import { extractPdfText } from "./pdf-extractor";
import { PLAINTEXT_EXTENSIONS, MAX_EXTRACTED_CHARS } from "../constants";

/** Which non-markdown file types to index, and the size cap for extraction. */
export interface FileTypeOptions {
	plainText: boolean;
	canvas: boolean;
	pdf: boolean;
	/** Files larger than this are skipped (0 = no limit). */
	maxFileSizeBytes: number;
}

export class VaultIndexer {
	constructor(
		private app: App,
		private excludedFolders: string[],
		private excludedTags: string[] = [],
		private fileTypes: FileTypeOptions = {
			plainText: true,
			canvas: true,
			pdf: false,
			maxFileSizeBytes: 5 * 1024 * 1024,
		},
	) {}

	/** Number of indexable files in the vault */
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

	/**
	 * Indexes a single file, dispatching to the appropriate extractor based on
	 * its type. Returns null if the file isn't indexable or extraction failed.
	 */
	async indexFile(file: TFile): Promise<IndexableDocument | null> {
		if (!this.isIndexable(file)) return null;

		const ext = file.extension.toLowerCase();
		try {
			if (ext === "md") return await this.indexMarkdown(file);
			if (ext === "canvas") return await this.indexCanvas(file);
			if (ext === "pdf") return await this.indexPdf(file);
			if (PLAINTEXT_EXTENSIONS.has(ext)) return await this.indexPlainText(file);
		} catch (err) {
			// A single unreadable/corrupt file must never break the whole build.
			console.warn(`Lightning Local Search: failed to index ${file.path}`, err);
		}
		return null;
	}

	updateExcludedFolders(folders: string[]): void {
		this.excludedFolders = folders;
	}

	updateExcludedTags(tags: string[]): void {
		this.excludedTags = tags;
	}

	updateFileTypes(options: FileTypeOptions): void {
		this.fileTypes = options;
	}

	/** Whether a file should be indexed given current exclusions and type settings. */
	isIndexable(file: TFile): boolean {
		if (this.isExcluded(file)) return false;
		const ext = file.extension.toLowerCase();

		// Markdown is always indexed.
		if (ext === "md") return true;

		if (ext === "canvas") return this.fileTypes.canvas && this.withinSizeLimit(file);
		// PDF parsing (pdf.js) is heavy; skip it on mobile to protect memory.
		if (ext === "pdf") {
			return this.fileTypes.pdf && !Platform.isMobile && this.withinSizeLimit(file);
		}
		if (PLAINTEXT_EXTENSIONS.has(ext)) {
			return this.fileTypes.plainText && this.withinSizeLimit(file);
		}
		return false;
	}

	private withinSizeLimit(file: TFile): boolean {
		const limit = this.fileTypes.maxFileSizeBytes;
		return limit <= 0 || file.stat.size <= limit;
	}

	private getIndexableFiles(): TFile[] {
		return this.app.vault.getFiles().filter((f) => this.isIndexable(f));
	}

	private isExcluded(file: TFile): boolean {
		return this.excludedFolders.some(
			(folder) =>
				file.path.startsWith(folder + "/") || file.path === folder,
		);
	}

	// ── Per-type extractors ────────────────────────────────────────────

	private async indexMarkdown(file: TFile): Promise<IndexableDocument | null> {
		const content = await this.app.vault.cachedRead(file);
		const metadata = this.app.metadataCache.getFileCache(file);

		const tags = this.extractTags(metadata);

		// Skip notes that have any excluded tag
		if (this.excludedTags.length > 0 && tags.some((t) => this.excludedTags.includes(t))) {
			return null;
		}

		return {
			...this.baseDocument(file, "markdown"),
			content: stripMarkdown(content),
			tags,
			headings: this.extractHeadings(metadata),
			frontmatter: this.extractFrontmatter(metadata),
		};
	}

	private async indexPlainText(file: TFile): Promise<IndexableDocument> {
		const content = await this.app.vault.cachedRead(file);
		return {
			...this.baseDocument(file, "plaintext"),
			content: content.slice(0, MAX_EXTRACTED_CHARS),
		};
	}

	private async indexCanvas(file: TFile): Promise<IndexableDocument> {
		const raw = await this.app.vault.cachedRead(file);
		return {
			...this.baseDocument(file, "canvas"),
			content: extractCanvasText(raw).slice(0, MAX_EXTRACTED_CHARS),
		};
	}

	private async indexPdf(file: TFile): Promise<IndexableDocument | null> {
		const data = await this.app.vault.readBinary(file);
		const text = await extractPdfText(data);
		// Scanned PDFs have no text layer — skip rather than index an empty doc.
		if (text.trim().length === 0) return null;
		return {
			...this.baseDocument(file, "pdf"),
			content: text,
		};
	}

	/** Common fields shared by every document type. */
	private baseDocument(
		file: TFile,
		fileType: FileType,
	): IndexableDocument {
		return {
			path: file.path,
			title: file.basename,
			content: "",
			tags: [],
			folder: file.parent?.path ?? "",
			headings: [],
			createdAt: file.stat.ctime,
			modifiedAt: file.stat.mtime,
			frontmatter: "",
			fileType,
		};
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

/**
 * Pulls human-readable text out of a .canvas file (JSON): text nodes, node
 * labels, referenced file names, and edge labels. Falls back to the raw string
 * if the JSON can't be parsed.
 */
function extractCanvasText(raw: string): string {
	try {
		const data = JSON.parse(raw) as unknown as {
			nodes?: Array<{ text?: string; label?: string; file?: string }>;
			edges?: Array<{ label?: string }>;
		};
		const parts: string[] = [];
		for (const node of data.nodes ?? []) {
			if (typeof node.text === "string") parts.push(node.text);
			if (typeof node.label === "string") parts.push(node.label);
			if (typeof node.file === "string") parts.push(node.file);
		}
		for (const edge of data.edges ?? []) {
			if (typeof edge.label === "string") parts.push(edge.label);
		}
		return parts.join("\n");
	} catch {
		return raw;
	}
}
