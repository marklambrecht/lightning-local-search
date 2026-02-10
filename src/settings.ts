import { App, PluginSettingTab, Setting } from "obsidian";
import type AISearchPlugin from "./main";

export class AISearchSettingTab extends PluginSettingTab {
	plugin: AISearchPlugin;

	constructor(app: App, plugin: AISearchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Search settings ──
		new Setting(containerEl).setName("Search").setHeading();

		new Setting(containerEl)
			.setName("Maximum results")
			.setDesc("Maximum number of search results to display")
			.addSlider((slider) =>
				slider
					.setLimits(5, 100, 5)
					.setValue(this.plugin.settings.maxResults)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxResults = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show similarity scores")
			.setDesc("Display relevance scores next to search results")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showScores)
					.onChange(async (value) => {
						this.plugin.settings.showScores = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Fuzzy search")
			.setDesc(
				"Allow approximate matches for words longer than 4 characters. " +
					"Helps with typos but may return less precise results.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableFuzzySearch)
					.onChange(async (value) => {
						this.plugin.settings.enableFuzzySearch = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Excerpt length")
			.setDesc("Number of characters to show in result excerpts")
			.addSlider((slider) =>
				slider
					.setLimits(50, 500, 25)
					.setValue(this.plugin.settings.excerptLength)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.excerptLength = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── Indexing settings ──
		new Setting(containerEl).setName("Indexing").setHeading();

		new Setting(containerEl)
			.setName("Excluded folders")
			.setDesc("Comma-separated list of folders to exclude from indexing")
			.addText((text) =>
				text
					.setPlaceholder("templates, archive")
					.setValue(this.plugin.settings.excludedFolders.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.excludedFolders = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Index on startup")
			.setDesc("Automatically index vault when Obsidian starts")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.indexOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.indexOnStartup = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── Semantic search settings (Phase 4) ──
		new Setting(containerEl).setName("Semantic search").setHeading();

		new Setting(containerEl)
			.setName("Enable local embeddings")
			.setDesc(
				"Generate vector embeddings locally for semantic search. " +
					"Uses ~23 MB of storage. Not recommended on mobile.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableEmbeddings)
					.onChange(async (value) => {
						this.plugin.settings.enableEmbeddings = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── Claude API settings (Phase 5) ──
		new Setting(containerEl).setName("Claude AI features").setHeading();

		new Setting(containerEl)
			.setName("Enable AI features")
			.setDesc(
				"Allow AI-powered search summaries using Claude. " +
					"Requires an Anthropic API key. " +
					"Data is only sent with your explicit consent.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAI)
					.onChange(async (value) => {
						this.plugin.settings.enableAI = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Claude API key")
			.setDesc("Your Anthropic API key for AI-powered features")
			.addText((text) =>
				text
					.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.claudeApiKey)
					.onChange(async (value) => {
						this.plugin.settings.claudeApiKey = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Claude model")
			.setDesc("Which Claude model to use for AI summaries")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"claude-sonnet-4-5-20250929",
						"Sonnet 4.5 (recommended)",
					)
					.addOption(
						"claude-haiku-4-5-20251001",
						"Haiku 4.5 (fastest)",
					)
					.addOption("claude-opus-4-6", "Opus 4.6 (highest quality)")
					.setValue(this.plugin.settings.claudeModel)
					.onChange(async (value) => {
						this.plugin.settings.claudeModel = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Require consent per request")
			.setDesc(
				"Show a confirmation dialog before each AI request, " +
					"displaying exactly what data will be sent",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.requireConsentPerRequest)
					.onChange(async (value) => {
						this.plugin.settings.requireConsentPerRequest = value;
						await this.plugin.saveSettings();
					}),
			);

		// ── Privacy settings ──
		new Setting(containerEl).setName("Privacy").setHeading();

		new Setting(containerEl)
			.setName("Audit log")
			.setDesc("Keep a local log of all AI API requests and responses")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.auditLogEnabled)
					.onChange(async (value) => {
						this.plugin.settings.auditLogEnabled = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
