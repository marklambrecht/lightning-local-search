import { useState, useCallback, useRef, useMemo, useEffect } from "preact/hooks";
import { TFile, MarkdownView, setIcon, type App, type WorkspaceLeaf } from "obsidian";
import type AISearchPlugin from "../main";
import type { SearchResult, SearchViewState } from "../types";
import type { AISearchView } from "./search-view";
import { parseQuery } from "../indexer/query-parser";
import { DEBOUNCE_MS, MAX_SEARCH_HISTORY } from "../constants";
import { buildPrompt } from "../claude/prompt-builder";
import { ClaudeClient } from "../claude/claude-client";
import { ConsentManager } from "../claude/consent-manager";
import { highlightAndScrollToMatch } from "../utils/editor-highlight";
import { SearchInput } from "./components/SearchInput";
import { ResultList } from "./components/ResultList";
import { ProgressBar } from "./components/ProgressBar";
import { AISummary } from "./components/AISummary";

function ObsidianIcon({ icon }: { icon: string }) {
	const ref = useRef<HTMLSpanElement>(null);
	useEffect(() => {
		if (ref.current) {
			setIcon(ref.current, icon);
		}
	}, [icon]);
	return <span ref={ref} class="ai-search-icon" />;
}

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
	const [sortOrder, setSortOrder] = useState("modified-new");
	const [caseSensitive, setCaseSensitive] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const [showHistory, setShowHistory] = useState(false);
	const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);
	const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [suggestionItems, setSuggestionItems] = useState<string[]>([]);
	const [suggestionType, setSuggestionType] = useState<"tag" | "folder" | null>(null);
	const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const targetLeafRef = useRef<WorkspaceLeaf | null>(null);

	// Auto-focus the search input when the view opens
	useEffect(() => {
		// Small delay lets the view finish rendering before focusing
		const timer = setTimeout(() => inputRef.current?.focus(), 50);
		return () => clearTimeout(timer);
	}, []);

	// Clear any pending debounced search when the view unmounts, otherwise the
	// timer fires after teardown and calls setState on an unmounted component.
	useEffect(() => {
		return () => {
			if (searchTimeout.current) {
				clearTimeout(searchTimeout.current);
			}
		};
	}, []);

	// Register a callback so the view can clear the search bar externally
	useEffect(() => {
		view.clearSearchCallback = () => {
			if (searchTimeout.current) {
				clearTimeout(searchTimeout.current);
			}
			setState((prev) => ({
				...prev,
				query: "",
				results: [],
				isSearching: false,
				aiSummary: null,
				error: null,
			}));
			setSelectedIndex(-1);
			setShowSuggestions(false);
		};
		return () => {
			view.clearSearchCallback = null;
		};
	}, [view]);

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
		[plugin, caseSensitive],
	);

	const handleToggleCaseSensitive = useCallback(() => {
		setCaseSensitive((prev) => !prev);
	}, []);

	// Re-run the search when case sensitivity changes. This must be an effect
	// (not inline in the toggle handler) so that `handleSearch` has already been
	// recreated with the NEW `caseSensitive` value before it runs — otherwise
	// the re-search would use the stale value and require a second toggle.
	const didMountCase = useRef(false);
	useEffect(() => {
		if (!didMountCase.current) {
			didMountCase.current = true;
			return;
		}
		if (state.query.trim().length > 0) {
			handleSearch(state.query);
		}
		// Intentionally only re-run on case-sensitivity change.
	}, [caseSensitive]);

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

	const openResultWithHighlight = useCallback(
		async (path: string, newTab: boolean) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) return;
			let leaf: WorkspaceLeaf;
			if (newTab) {
				leaf = app.workspace.getLeaf("tab");
			} else {
				const cached = targetLeafRef.current;
				// Check if the cached leaf is still alive and usable
				// (another plugin like Better Export PDF can take over the tab)
				const viewType = cached?.view?.getViewType?.();
				const isUsable = cached
					&& (cached as any).containerEl?.isConnected === true
					&& (viewType === "markdown" || viewType === "empty");
				if (isUsable) {
					leaf = cached;
				} else {
					leaf = app.workspace.getLeaf("tab");
					targetLeafRef.current = leaf;
				}
			}
			await leaf.openFile(file);

			// Wait for editor to initialize, then highlight + scroll
			setTimeout(() => {
				const mdView = leaf.view;
				if (mdView instanceof MarkdownView) {
					highlightAndScrollToMatch(mdView, searchTerms);
				}
			}, 100);
		},
		[app, searchTerms],
	);

	const handleResultClick = useCallback(
		(result: SearchResult, e: MouseEvent) => {
			const newTab = e.ctrlKey || e.metaKey || e.button === 1;
			addToHistory(state.query);
			void openResultWithHighlight(result.path, newTab);
		},
		[openResultWithHighlight, addToHistory, state.query],
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

	const handleHistorySelect = useCallback(
		(query: string) => {
			setShowHistory(false);
			setSelectedHistoryIndex(-1);
			handleSearch(query);
		},
		[handleSearch],
	);

	// Keyboard navigation
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			// History dropdown navigation
			if (showHistory && plugin.settings.searchHistory.length > 0) {
				const historyCount = plugin.settings.searchHistory.length;
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setSelectedHistoryIndex((prev) => Math.min(prev + 1, historyCount - 1));
					return;
				} else if (e.key === "ArrowUp") {
					e.preventDefault();
					setSelectedHistoryIndex((prev) => Math.max(prev - 1, -1));
					return;
				} else if (e.key === "Enter" && selectedHistoryIndex >= 0) {
					e.preventDefault();
					const query = plugin.settings.searchHistory[selectedHistoryIndex];
					if (query) {
						setSelectedHistoryIndex(-1);
						handleHistorySelect(query);
					}
					return;
				} else if (e.key === "Escape") {
					e.preventDefault();
					setShowHistory(false);
					setSelectedHistoryIndex(-1);
					return;
				}
			}

			// Enter with no selected result: dismiss mobile keyboard
			if (e.key === "Enter" && selectedIndex < 0) {
				inputRef.current?.blur();
				return;
			}

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
					addToHistory(state.query);
					const newTab = e.ctrlKey || e.metaKey;
					void openResultWithHighlight(result.path, newTab);
				}
			} else if (e.key === "Escape") {
				setSelectedIndex(-1);
				inputRef.current?.focus();
			}
		},
		[state.results.length, selectedIndex, openResultWithHighlight, addToHistory, state.query, showHistory, selectedHistoryIndex, plugin.settings.searchHistory, handleHistorySelect],
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

	const handleClear = useCallback(() => {
		if (searchTimeout.current) {
			clearTimeout(searchTimeout.current);
		}
		setState((prev) => ({
			...prev,
			query: "",
			results: [],
			isSearching: false,
			aiSummary: null,
			error: null,
		}));
		setSelectedIndex(-1);
		setShowSuggestions(false);
		inputRef.current?.focus();
	}, []);

	const handleInputFocus = useCallback(() => {
		if (plugin.settings.searchHistory.length > 0) {
			setShowHistory(true);
			setSelectedHistoryIndex(-1);
		}
	}, [plugin.settings.searchHistory.length]);

	const handleInputBlur = useCallback(() => {
		// Delay to allow click on history/suggestion items
		setTimeout(() => {
			setShowHistory(false);
			setSelectedHistoryIndex(-1);
			setShowSuggestions(false);
		}, 200);
	}, []);



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
			// Filter out results from AI-excluded folders
			const aiExcluded = plugin.settings.aiExcludedFolders;
			const filteredResults = aiExcluded.length > 0
				? state.results.filter((r) =>
					!aiExcluded.some((folder) => {
						const f = folder.toLowerCase();
						const rf = r.folder.toLowerCase();
						return rf === f || rf.startsWith(f + "/");
					}),
				)
				: state.results;

			if (filteredResults.length === 0) {
				setState((prev) => ({
					...prev,
					aiSummary: "All search results are in folders excluded from AI (see Settings > Lightning Local Search > AI excluded folders). To use Ask AI, adjust your search or exclusion settings so that at least one result comes from a non-excluded folder.",
				}));
				setIsAskingAI(false);
				return;
			}

			const request = buildPrompt(
				state.query,
				filteredResults,
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

	const showAIButton =
		plugin.settings.enableAI &&
		plugin.settings.claudeApiKey.length > 0 &&
		state.results.length > 0;

	const canPin = state.query.trim().length > 0 && !plugin.settings.pinnedQueries.includes(state.query.trim());

	return (
		<div class="ai-search-container" onKeyDown={handleKeyDown}>
			<SearchInput
				value={state.query}
				onInput={handleInputChange}
				onClear={handleClear}
				onFocus={handleInputFocus}
				onBlur={handleInputBlur}
				isSearching={state.isSearching}
				inputRef={inputRef}
			/>
			<div class="ai-search-actions-row">
				{plugin.settings.searchHistory.length > 0 && (
					<button
						class="ai-search-history-btn"
						title="Search history"
						onMouseDown={(e) => {
							e.preventDefault();
							setShowHistory((prev) => !prev);
						}}
					>
						<ObsidianIcon icon="clock" />
					</button>
				)}
				{canPin && (
					<button
						class="ai-search-pin-btn"
						title="Pin this query"
						onClick={handlePinQuery}
					>
						<ObsidianIcon icon="pin" />
					</button>
				)}
				<button
					class="ai-search-help-btn"
					title="Search syntax help"
					onClick={() => setShowSyntaxHelp((prev) => !prev)}
				>
					<ObsidianIcon icon="info" />
				</button>
			</div>

			{/* Search history dropdown */}
			{showHistory && plugin.settings.searchHistory.length > 0 && (
				<div class="ai-search-dropdown">
					<div class="ai-search-dropdown-header">
						<span>History</span>
						<span
							class="ai-search-dropdown-close"
							onMouseDown={(e) => {
								e.preventDefault();
								setShowHistory(false);
							}}
						>
							&times;
						</span>
					</div>
					{plugin.settings.searchHistory.map((query, index) => (
						<div
							key={query}
							class={`ai-search-dropdown-item${index === selectedHistoryIndex ? " ai-search-dropdown-item-selected" : ""}`}
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
					<div class="ai-search-syntax-help-header">
						<span>Search options</span>
						<span
							class="ai-search-dropdown-close"
							onMouseDown={(e) => {
								e.preventDefault();
								setShowSyntaxHelp(false);
							}}
						>
							&times;
						</span>
					</div>
					<div class="ai-search-syntax-row"><code>path:</code> match path of the file</div>
					<div class="ai-search-syntax-row"><code>file:</code> match file name</div>
					<div class="ai-search-syntax-row"><code>tag:</code> search for tags</div>
					<div class="ai-search-syntax-row"><code>line:</code> search keywords on same line</div>
					<div class="ai-search-syntax-row"><code>section:</code> search keywords under same heading</div>
					<div class="ai-search-syntax-row"><code>[property]</code> match property</div>
					<div class="ai-search-syntax-row"><code>"exact phrase"</code> exact phrase match</div>
					<div class="ai-search-syntax-row"><code>-word</code> exclude word</div>
					<div class="ai-search-syntax-row"><code>created:&gt;date</code> created after date</div>
					<div class="ai-search-syntax-row"><code>modified:&lt;date</code> modified before date</div>
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
