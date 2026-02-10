import { ItemView, type WorkspaceLeaf } from "obsidian";
import { h, render } from "preact";
import { VIEW_TYPE_AI_SEARCH } from "../constants";
import type AISearchPlugin from "../main";
import { SearchViewRoot } from "./search-view-root";

export class AISearchView extends ItemView {
	private plugin: AISearchPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: AISearchPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_AI_SEARCH;
	}

	getDisplayText(): string {
		return "AI search";
	}

	getIcon(): string {
		return "search";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass("ai-search-view-container");

		render(
			h(SearchViewRoot, {
				plugin: this.plugin,
				app: this.app,
			}),
			container,
		);
	}

	async onClose(): Promise<void> {
		const container = this.containerEl.children[1];
		if (container) {
			render(null, container);
		}
	}
}
