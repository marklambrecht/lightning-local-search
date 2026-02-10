/**
 * Strips markdown syntax for cleaner indexing.
 * Removes YAML frontmatter, links, code blocks, HTML, excess whitespace.
 */
export function stripMarkdown(content: string): string {
	let text = content;

	// Remove YAML frontmatter
	text = text.replace(/^---\n[\s\S]*?\n---\n?/, "");

	// Remove code blocks
	text = text.replace(/```[\s\S]*?```/g, "");
	text = text.replace(/`[^`]+`/g, "");

	// Remove wiki links, keep display text or link target
	text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
	text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");

	// Remove markdown links, keep link text
	text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

	// Remove images
	text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

	// Remove HTML tags
	text = text.replace(/<[^>]+>/g, "");

	// Remove headings markers (keep text)
	text = text.replace(/^#{1,6}\s+/gm, "");

	// Remove emphasis markers
	text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
	text = text.replace(/\*([^*]+)\*/g, "$1");
	text = text.replace(/__([^_]+)__/g, "$1");
	text = text.replace(/_([^_]+)_/g, "$1");
	text = text.replace(/~~([^~]+)~~/g, "$1");

	// Remove blockquote markers
	text = text.replace(/^>\s?/gm, "");

	// Remove horizontal rules
	text = text.replace(/^[-*_]{3,}\s*$/gm, "");

	// Remove list markers
	text = text.replace(/^[\s]*[-*+]\s+/gm, "");
	text = text.replace(/^[\s]*\d+\.\s+/gm, "");

	// Collapse whitespace
	text = text.replace(/\n{3,}/g, "\n\n");
	text = text.replace(/[ \t]+/g, " ");

	return text.trim();
}

/**
 * Generates a text excerpt around a match position.
 */
export function generateExcerpt(
	content: string,
	matchPosition: number,
	length: number,
): string {
	const halfLen = Math.floor(length / 2);
	let start = Math.max(0, matchPosition - halfLen);
	let end = Math.min(content.length, matchPosition + halfLen);

	// Try to align to word boundaries
	if (start > 0) {
		const spaceIdx = content.indexOf(" ", start);
		if (spaceIdx !== -1 && spaceIdx < start + 20) {
			start = spaceIdx + 1;
		}
	}
	if (end < content.length) {
		const spaceIdx = content.lastIndexOf(" ", end);
		if (spaceIdx !== -1 && spaceIdx > end - 20) {
			end = spaceIdx;
		}
	}

	let excerpt = content.slice(start, end);
	if (start > 0) excerpt = "..." + excerpt;
	if (end < content.length) excerpt = excerpt + "...";

	return excerpt;
}

/**
 * Generates an excerpt from the beginning of content for display.
 */
export function generatePreviewExcerpt(
	content: string,
	length: number,
): string {
	if (content.length <= length) return content;
	const spaceIdx = content.lastIndexOf(" ", length);
	const cutoff = spaceIdx > length - 30 ? spaceIdx : length;
	return content.slice(0, cutoff) + "...";
}

/**
 * Simple non-cryptographic hash (djb2) for change detection.
 */
export function contentHash(content: string): string {
	let hash = 5381;
	for (let i = 0; i < content.length; i++) {
		hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
	}
	return (hash >>> 0).toString(36);
}

/**
 * Splits content into chunks suitable for embedding.
 * Respects paragraph boundaries where possible.
 */
export function chunkContent(
	content: string,
	maxChunkSize: number,
): string[] {
	if (content.length <= maxChunkSize) {
		return [content];
	}

	const paragraphs = content.split(/\n\n+/);
	const chunks: string[] = [];
	let current = "";

	for (const para of paragraphs) {
		if (current.length + para.length + 2 > maxChunkSize) {
			if (current.length > 0) {
				chunks.push(current.trim());
				current = "";
			}
			// If a single paragraph exceeds max, split by sentences
			if (para.length > maxChunkSize) {
				const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
				for (const sentence of sentences) {
					if (current.length + sentence.length > maxChunkSize) {
						if (current.length > 0) {
							chunks.push(current.trim());
							current = "";
						}
						// If single sentence is too long, just slice it
						if (sentence.length > maxChunkSize) {
							chunks.push(sentence.slice(0, maxChunkSize));
						} else {
							current = sentence;
						}
					} else {
						current += sentence;
					}
				}
			} else {
				current = para;
			}
		} else {
			current += (current.length > 0 ? "\n\n" : "") + para;
		}
	}

	if (current.trim().length > 0) {
		chunks.push(current.trim());
	}

	return chunks;
}
