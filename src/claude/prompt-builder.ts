import type { SearchResult, ClaudeRequest } from "../types";

/**
 * Builds a Claude API prompt from search results.
 * Follows data minimization: only sends excerpts, not full notes.
 */
export function buildPrompt(
	query: string,
	results: SearchResult[],
	maxTokens: number,
	customQuestion?: string,
): ClaudeRequest {
	const contextParts: string[] = [];
	let estimatedTokens = 0;
	let noteCount = 0;

	for (const result of results) {
		const excerpt =
			`## ${result.title}\n` +
			`Path: ${result.path}\n` +
			`Score: ${Math.round(result.score * 100)}%\n` +
			(result.matchedTags.length > 0
				? `Tags: ${result.matchedTags.map((t) => "#" + t).join(", ")}\n`
				: "") +
			`\n${result.excerpt}\n\n---\n`;

		const excerptTokens = Math.ceil(excerpt.length / 4);
		if (estimatedTokens + excerptTokens > maxTokens) break;

		contextParts.push(excerpt);
		estimatedTokens += excerptTokens;
		noteCount++;
	}

	const systemPrompt =
		"You are a helpful research assistant for an Obsidian vault. " +
		"Based on the user's query and the provided note excerpts, " +
		"provide a concise natural language summary that answers the query. " +
		"Reference specific notes by title when relevant. " +
		"If the excerpts don't contain enough information, say so honestly.";

	const questionText = customQuestion?.trim() || query;
	const userMessage =
		`Query: ${questionText}\n\n` +
		`Here are the most relevant notes from the vault:\n\n` +
		contextParts.join("\n");

	const fullPrompt = `${systemPrompt}\n\n${userMessage}`;

	return {
		id: crypto.randomUUID(),
		timestamp: Date.now(),
		query,
		contextNoteCount: noteCount,
		contextTokenEstimate: estimatedTokens,
		prompt: fullPrompt,
	};
}
