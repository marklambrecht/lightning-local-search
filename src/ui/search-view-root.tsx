import { useState, useCallback, useRef, useMemo, useEffect } from "preact/hooks";
import type { App } from "obsidian";
import type AISearchPlugin from "../main";
import type { SearchResult, SearchViewState } from "../types";
import type { AISearchView } from "./search-view";
import { parseQuery } from "../indexer/query-parser";
import { DEBOUNCE_MS, MAX_SEARCH_HISTORY } from "../constants";
import { buildPrompt } from "../claude/prompt-builder";
import { ClaudeClient } from "../claude/claude-client";
import { ConsentManager } from "../claude/consent-manager";
import { SearchInput } from "./components/SearchInput";
import { ResultList } from "./components/ResultList";
import { ProgressBar } from "./components/ProgressBar";
import { AISummary } from "./components/AISummary";

interface SearchViewRootProps {
	plugin: AISearchPlugin;
	app: App;
	view: AISearchView;
}

export function SearchViewRoot({ plugin, app, view }: SearchViewRootProps) {
	const [state, setState] = useState<SearchViewState>({
		query: "",
		results: [],
		isSearching: false,
		isIndexing: false,
		indexProgress: 0,
		embeddingProgress: 0,
		aiSummary: null,
		error: null,
	});

	const [isAskingAI, setIsAskingAI] = useState(false);
	const [aiQuestion, setAiQuestion] = useState("");
	const [sortOrder, setSortOrder] = useState("relevance");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const [showHistory, setShowHistory] = useState(false);
	const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [suggestionItems, setSuggestionItems] = useState<string[]>([]);
	const [suggestionType, setSuggestionType] = useState<"tag" | "folder" | null>(null);
	const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Update view title when results change
	useEffect(() => {
		view.updateResultCount(state.results.length);
	}, [state.results.length, view]);

	const addToHistory = useCallback((query: string) => {
		const trimmed = query.trim();
		if (trimmed.length === 0) return;
		const history = plugin.settings.searchHistory.filter((h) => h !== trimmed);
		history.unshift(trimmed);
		plugin.settings.searchHistory = history.slice(0, MAX_SEARCH_HISTORY);
		void plugin.saveSettings();
	}, [plugin]);

	const handleSearch = useCallback(
		(query: string) => {
			setState((prev) => ({
				...prev,
				query,
				isSearching: true,
				error: null,
				aiSummary: null,
			}));
			setAiQuestion(query);
			setSelectedIndex(-1);
			setShowHistory(false);
			setShowSuggestions(false);

			if (searchTimeout.current) {
				clearTimeout(searchTimeout.current);
			}

			searchTimeout.current = setTimeout(() => {
				void (async () => {
					try {
						if (query.trim().length === 0) {
							setState((prev) => ({
								...prev,
								results: [],
								isSearching: false,
							}));
							return;
						}

						const parsed = parseQuery(query);
						const results = await plugin.oramaIndex.search(
							parsed,
							plugin.settings.maxResults,
							plugin.settings.excerptLength,
							plugin.settings.enableFuzzySearch,
							caseSensitive,
						);

						setState((prev) => ({
							...prev,
							results,
							isSearching: false,
							error: null,
						}));

						// Add to history after successful search
						addToHistory(query);
					} catch (err) {
						setState((prev) => ({
							...prev,
							isSearching: false,
							error:
								err instanceof Error
									? err.message
									: "Search failed",
						}));
					}
				})();
			}, DEBOUNCE_MS.search);
		},
		[plugin, caseSensitive, addToHistory],
	);

	const handleToggleCaseSensitive = useCallback(() => {
		setCaseSensitive((prev) => {
			const next = !prev;
			// Re-trigger search with new case sensitivity
			if (state.query.trim().length > 0) {
				handleSearch(state.query);
			}
			return next;
		});
	}, [state.query, handleSearch]);

	const handleResultClick = useCallback(
		(result: SearchResult, e: MouseEvent) => {
			const newTab = e.ctrlKey || e.metaKey || e.button === 1;
			void app.workspace.openLinkText(result.path, "", newTab);
		},
		[app],
	);

	const handleResultHover = useCallback(
		(event: MouseEvent, targetEl: HTMLElement, path: string) => {
			app.workspace.trigger("hover-link", {
				event,
				source: "preview",
				hoverParent: view,
				targetEl,
				linktext: path,
				sourcePath: "",
			});
		},
		[app, view],
	);

	// Keyboard navigation
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const resultCount = state.results.length;
			if (resultCount === 0) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((prev) => Math.min(prev + 1, resultCount - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((prev) => Math.max(prev - 1, -1));
			} else if (e.key === "Enter" && selectedIndex >= 0) {
				e.preventDefault();
				const sorted = sortedResults;
				const result = sorted[selectedIndex];
				if (result) {
					const newTab = e.ctrlKey || e.metaKey;
					void app.workspace.openLinkText(result.path, "", newTab);
				}
			} else if (e.key === "Escape") {
				setSelectedIndex(-1);
				inputRef.current?.focus();
			}
		},
		[state.results.length, selectedIndex, app],
	);

	// Auto-suggest: detect # or path:/folder: context
	const handleInputChange = useCallback(
		(query: string) => {
			handleSearch(query);

			// Check for auto-suggest triggers
			const cursorPos = inputRef.current?.selectionStart ?? query.length;
			const textBeforeCursor = query.slice(0, cursorPos);

			// Check for tag auto-suggest: # at end or # followed by partial text
			const tagMatch = textBeforeCursor.match(/#([a-zA-Z0-9_\-/]*)$/);
			if (tagMatch) {
				const partial = tagMatch[1]?.toLowerCase() ?? "";
				const allTags = plugin.oramaIndex.getAllTags();
				const filtered = partial.length > 0
					? allTags.filter((t) => t.toLowerCase().startsWith(partial))
					: allTags.slice(0, 20);
				if (filtered.length > 0) {
					setSuggestionItems(filtered);
					setSuggestionType("tag");
					setShowSuggestions(true);
					return;
				}
			}

			// Check for folder auto-suggest: path: or folder: followed by partial text
			const folderMatch = textBeforeCursor.match(/(?:path|folder):([^\s]*)$/);
			if (folderMatch) {
				const partial = folderMatch[1]?.toLowerCase() ?? "";
				const allFolders = plugin.oramaIndex.getAllFolders();
				const filtered = partial.length > 0
					? allFolders.filter((f) => f.toLowerCase().startsWith(partial))
					: allFolders.slice(0, 20);
				if (filtered.length > 0) {
					setSuggestionItems(filtered);
					setSuggestionType("folder");
					setShowSuggestions(true);
					return;
				}
			}

			setShowSuggestions(false);
		},
		[handleSearch, plugin],
	);

	const handleSuggestionSelect = useCallback(
		(item: string) => {
			const query = state.query;
			const cursorPos = inputRef.current?.selectionStart ?? query.length;
			const textBeforeCursor = query.slice(0, cursorPos);
			const textAfterCursor = query.slice(cursorPos);

			let newQuery: string;
			if (suggestionType === "tag") {
				// Replace the #partial with #fullTag
				newQuery = textBeforeCursor.replace(/#[a-zA-Z0-9_\-/]*$/, `#${item}`) + textAfterCursor;
			} else {
				// Replace the path:partial or folder:partial with full value
				newQuery = textBeforeCursor.replace(/(?:path|folder):[^\s]*$/, `path:${item}`) + textAfterCursor;
			}

			setShowSuggestions(false);
			handleSearch(newQuery + " ");
		},
		[state.query, suggestionType, handleSearch],
	);

	const handleInputFocus = useCallback(() => {
		if (state.query.trim().length === 0 && plugin.settings.searchHistory.length > 0) {
			setShowHistory(true);
		}
	}, [state.query, plugin.settings.searchHistory.length]);

	const handleInputBlur = useCallback(() => {
		// Delay to allow click on history/suggestion items
		setTimeout(() => {
			setShowHistory(false);
			setShowSuggestions(false);
		}, 200);
	}, []);

	const handleHistorySelect = useCallback(
		(query: string) => {
			setShowHistory(false);
			handleSearch(query);
		},
		[handleSearch],
	);

	const handlePinQuery = useCallback(() => {
		const trimmed = state.query.trim();
		if (trimmed.length === 0) return;
		if (plugin.settings.pinnedQueries.includes(trimmed)) return;
		plugin.settings.pinnedQueries.push(trimmed);
		void plugin.saveSettings();
		setState((prev) => ({ ...prev })); // trigger re-render
	}, [state.query, plugin]);

	const handleUnpinQuery = useCallback(
		(query: string) => {
			plugin.settings.pinnedQueries = plugin.settings.pinnedQueries.filter(
				(q) => q !== query,
			);
			void plugin.saveSettings();
			setState((prev) => ({ ...prev })); // trigger re-render
		},
		[plugin],
	);

	const handleAskAI = useCallback(async () => {
		if (state.results.length === 0 || isAskingAI) return;

		setIsAskingAI(true);
		setState((prev) => ({ ...prev, error: null }));

		try {
			const request = buildPrompt(
				state.query,
				state.results,
				plugin.settings.maxContextTokens,
				aiQuestion,
			);

			// Consent check
			if (plugin.settings.requireConsentPerRequest) {
				const consentManager = new ConsentManager(app);
				const consented = await consentManager.requestConsent(request);
				if (!consented) {
					setIsAskingAI(false);
					return;
				}
			}

			// Record in audit log
			plugin.auditLog?.recordRequest(request);

			// Send to Claude
			const client = new ClaudeClient(
				plugin.settings.claudeApiKey,
				plugin.settings.claudeModel,
			);
			const response = await client.sendMessage(
				request.prompt,
				request.id,
			);

			// Record response
			plugin.auditLog?.recordResponse(request.id, response);

			setState((prev) => ({
				...prev,
				aiSummary: response.summary,
			}));
		} catch (err) {
			const errorMsg =
				err instanceof Error ? err.message : "AI request failed";
			setState((prev) => ({ ...prev, error: errorMsg }));
		} finally {
			setIsAskingAI(false);
		}
	}, [state.results, state.query, isAskingAI, aiQuestion, plugin, app]);

	const sortedResults = useMemo(() => {
		if (sortOrder === "relevance") return state.results;
		const sorted = [...state.results];
		switch (sortOrder) {
			case "name-asc":
				sorted.sort((a, b) => a.title.localeCompare(b.title));
				break;
			case "name-desc":
				sorted.sort((a, b) => b.title.localeCompare(a.title));
				break;
			case "modified-new":
				sorted.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
				break;
			case "modified-old":
				sorted.sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
				break;
			case "created-new":
				sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
				break;
			case "created-old":
				sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
				break;
		}
		return sorted;
	}, [state.results, sortOrder]);

	const searchTerms = useMemo(() => {
		const parsed = parseQuery(state.query);
		const terms = parsed.text
			.split(/\s+/)
			.filter((t) => t.length > 0);
		// Add individual words from phrases for highlighting
		for (const phrase of parsed.phrases) {
			for (const word of phrase.split(/\s+/)) {
				if (word.length > 0 && !terms.includes(word)) {
					terms.push(word);
				}
			}
		}
		return terms;
	}, [state.query]);

	const showAIButton =
		plugin.settings.enableAI &&
		plugin.settings.claudeApiKey.length > 0 &&
		state.results.length > 0;

	const canPin = state.query.trim().length > 0 && !plugin.settings.pinnedQueries.includes(state.query.trim());

	return (
		<div class="ai-search-container" onKeyDown={handleKeyDown}>
			<div class="ai-search-input-row">
				<SearchInput
					value={state.query}
					onInput={handleInputChange}
					onFocus={handleInputFocus}
					onBlur={handleInputBlur}
					isSearching={state.isSearching}
					inputRef={inputRef}
				/>
				{canPin && (
					<button
						class="ai-search-pin-btn"
						title="Pin this query"
						onClick={handlePinQuery}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="12" y1="17" x2="12" y2="22" />
							<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
						</svg>
					</button>
				)}
				<button
					class="ai-search-help-btn"
					title="Search syntax help"
					onClick={() => setShowSyntaxHelp((prev) => !prev)}
				>
					?
				</button>
			</div>

			{/* Search history dropdown */}
			{showHistory && plugin.settings.searchHistory.length > 0 && (
				<div class="ai-search-dropdown">
					<div class="ai-search-dropdown-header">Recent searches</div>
					{plugin.settings.searchHistory.map((query) => (
						<div
							key={query}
							class="ai-search-dropdown-item"
							onMouseDown={() => handleHistorySelect(query)}
						>
							{query}
						</div>
					))}
				</div>
			)}

			{/* Auto-suggest dropdown */}
			{showSuggestions && suggestionItems.length > 0 && (
				<div class="ai-search-dropdown">
					<div class="ai-search-dropdown-header">
						{suggestionType === "tag" ? "Tags" : "Folders"}
					</div>
					{suggestionItems.map((item) => (
						<div
							key={item}
							class="ai-search-dropdown-item"
							onMouseDown={() => handleSuggestionSelect(item)}
						>
							{suggestionType === "tag" ? `#${item}` : item}
						</div>
					))}
				</div>
			)}

			{/* Syntax help panel */}
			{showSyntaxHelp && (
				<div class="ai-search-syntax-help">
					<div class="ai-search-syntax-row"><code>"exact phrase"</code> Exact phrase match</div>
					<div class="ai-search-syntax-row"><code>#tag</code> Filter by tag</div>
					<div class="ai-search-syntax-row"><code>-#tag</code> Exclude tag</div>
					<div class="ai-search-syntax-row"><code>-word</code> Exclude word</div>
					<div class="ai-search-syntax-row"><code>path:folder</code> Filter by folder</div>
					<div class="ai-search-syntax-row"><code>folder:name</code> Alias for path:</div>
					<div class="ai-search-syntax-row"><code>heading:term</code> Filter by heading</div>
					<div class="ai-search-syntax-row"><code>property:value</code> Filter by frontmatter</div>
					<div class="ai-search-syntax-row"><code>created:&gt;2024-01-01</code> Created after date</div>
					<div class="ai-search-syntax-row"><code>modified:&lt;2024-01-01</code> Modified before date</div>
				</div>
			)}

			{/* Pinned queries */}
			{plugin.settings.pinnedQueries.length > 0 && (
				<div class="ai-search-pinned">
					{plugin.settings.pinnedQueries.map((query) => (
						<span key={query} class="ai-search-pinned-chip">
							<span
								class="ai-search-pinned-text"
								onClick={() => handleSearch(query)}
							>
								{query.length > 30 ? query.slice(0, 30) + "..." : query}
							</span>
							<span
								class="ai-search-pinned-remove"
								onClick={() => handleUnpinQuery(query)}
							>
								&times;
							</span>
						</span>
					))}
				</div>
			)}

			<label class="ai-search-toggle">
				<input
					type="checkbox"
					checked={caseSensitive}
					onChange={handleToggleCaseSensitive}
				/>
				<span class="ai-search-toggle-label">Match case</span>
			</label>

			{state.results.length > 0 && (
				<div class="ai-search-toolbar">
					<span class="ai-search-result-count">
						{state.results.length} result{state.results.length !== 1 ? "s" : ""}
					</span>
					<select
						class="ai-search-sort-select"
						value={sortOrder}
						onChange={(e) =>
							setSortOrder(
								(e.target as HTMLSelectElement).value,
							)
						}
					>
						<option value="relevance">Relevance</option>
						<option value="name-asc">File name (A to Z)</option>
						<option value="name-desc">File name (Z to A)</option>
						<option value="modified-new">Modified time (new to old)</option>
						<option value="modified-old">Modified time (old to new)</option>
						<option value="created-new">Created time (new to old)</option>
						<option value="created-old">Created time (old to new)</option>
					</select>
				</div>
			)}

			{state.isIndexing && (
				<ProgressBar
					label="Indexing vault..."
					progress={state.indexProgress}
				/>
			)}

			{state.error && (
				<div class="ai-search-error">{state.error}</div>
			)}

			{state.aiSummary && <AISummary summary={state.aiSummary} />}

			{showAIButton && !state.aiSummary && (
				<div class="ai-search-ai-section">
					<textarea
						class="ai-search-ai-question"
						rows={3}
						placeholder="Edit your question for Claude..."
						value={aiQuestion}
						onInput={(e) =>
							setAiQuestion(
								(e.target as HTMLTextAreaElement).value,
							)
						}
					/>
					<button
						class="ai-search-ask-ai-btn"
						onClick={() => void handleAskAI()}
						disabled={isAskingAI || aiQuestion.trim().length === 0}
					>
						{isAskingAI ? "Asking Claude..." : "Ask AI"}
					</button>
				</div>
			)}

			<ResultList
				results={sortedResults}
				showScores={plugin.settings.showScores}
				searchTerms={searchTerms}
				excerptLines={plugin.settings.excerptLines}
				selectedIndex={selectedIndex}
				onResultClick={handleResultClick}
				onResultHover={handleResultHover}
			/>
		</div>
	);
}
