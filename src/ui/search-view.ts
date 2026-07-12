import { ItemView, type WorkspaceLeaf } from "obsidian";
import { h, render } from "preact";
import { VIEW_TYPE_AI_SEARCH } from "../constants";
import type AISearchPlugin from "../main";
import { SearchViewRoot, type SearchViewMode } from "./search-view-root";

export class AISearchView extends ItemView {
	private plugin: AISearchPlugin;
	private resultCount = 0;
	private currentMode: SearchViewMode | null = null;
	clearSearchCallback: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: AISearchPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_AI_SEARCH;
	}

	getDisplayText(): string {
		if (this.resultCount > 0) {
			return `Lightning Local Search (${this.resultCount})`;
		}
		return "Lightning Local Search";
	}

	updateResultCount(count: number): void {
		this.resultCount = count;
		// updateHeader exists at runtime but isn't in the type definitions
		(this.leaf as unknown as { updateHeader(): void }).updateHeader();
	}

	getIcon(): string {
		return "search";
	}

	/**
	 * "tab" when the view lives in the main editor area (wide, power layout),
	 * "sidebar" when docked in the left/right sidebar (compact single column).
	 */
	private detectMode(): SearchViewMode {
		return this.leaf.getRoot() === this.app.workspace.rootSplit
			? "tab"
			: "sidebar";
	}

	focusSearchInput(): void {
		const input = this.containerEl.querySelector<HTMLInputElement>(".ai-search-input");
		if (input && document.activeElement !== input) {
			this.clearSearchCallback?.();
			input.focus();
		}
	}

	private renderRoot(): void {
		const container = this.containerEl.children[1];
		if (!container) return;
		this.currentMode = this.detectMode();
		render(
			h(SearchViewRoot, {
				plugin: this.plugin,
				app: this.app,
				view: this,
				mode: this.currentMode,
			}),
			container,
		);
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container) return;
		container.empty();
		container.addClass("ai-search-view-container");

		this.renderRoot();

		// Dragging the view between the sidebar and the main area flips the
		// layout — re-render only when the mode actually changes to avoid
		// tearing down state on unrelated layout events.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				if (this.detectMode() !== this.currentMode) {
					this.renderRoot();
				}
			}),
		);
	}

	async onClose(): Promise<void> {
		const container = this.containerEl.children[1];
		if (container) {
			render(null, container);
		}
	}
}
