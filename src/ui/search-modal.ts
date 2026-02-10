import { SuggestModal, type App } from "obsidian";
import type { SearchResult } from "../types";
import type { OramaIndex } from "../indexer/orama-index";
import { parseQuery } from "../indexer/query-parser";

export class SearchModal extends SuggestModal<SearchResult> {
	private index: OramaIndex;
	private maxResults: number;
	private showScores: boolean;
	private excerptLength: number;
	private fuzzy: boolean;

	constructor(
		app: App,
		index: OramaIndex,
		maxResults: number,
		showScores: boolean,
		excerptLength: number,
		fuzzy: boolean,
	) {
		super(app);
		this.index = index;
		this.maxResults = maxResults;
		this.showScores = showScores;
		this.excerptLength = excerptLength;
		this.fuzzy = fuzzy;
		this.setPlaceholder(
			"Search notes... (#tag, path:folder, created:>date)",
		);
		this.setInstructions([
			{ command: "↑↓", purpose: "navigate" },
			{ command: "↵", purpose: "open note" },
			{ command: "esc", purpose: "close" },
		]);
	}

	async getSuggestions(query: string): Promise<SearchResult[]> {
		if (query.trim().length === 0) return [];
		const parsed = parseQuery(query);
		return this.index.search(parsed, this.maxResults, this.excerptLength, this.fuzzy);
	}

	renderSuggestion(result: SearchResult, el: HTMLElement): void {
		const container = el.createDiv({ cls: "ai-search-suggestion" });

		// Title row with optional score
		const header = container.createDiv({ cls: "ai-search-result-header" });
		header.createSpan({
			cls: "ai-search-result-title",
			text: result.title,
		});
		if (this.showScores) {
			header.createSpan({
				cls: "ai-search-result-score",
				text: `${Math.round(result.score * 100)}%`,
			});
		}

		// Folder path
		if (result.folder) {
			container.createDiv({
				cls: "ai-search-result-path",
				text: result.folder,
			});
		}

		// Excerpt
		if (result.excerpt) {
			container.createDiv({
				cls: "ai-search-result-excerpt",
				text: result.excerpt,
			});
		}

		// Tags
		if (result.matchedTags.length > 0) {
			const tagsEl = container.createDiv({ cls: "ai-search-result-tags" });
			for (const tag of result.matchedTags) {
				tagsEl.createSpan({
					cls: "ai-search-tag",
					text: `#${tag}`,
				});
			}
		}
	}

	onChooseSuggestion(result: SearchResult): void {
		void this.app.workspace.openLinkText(result.path, "", false);
	}
}
