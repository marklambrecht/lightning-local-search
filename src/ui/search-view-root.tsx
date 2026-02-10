import { useState, useCallback, useRef, useMemo } from "preact/hooks";
import type { App, ItemView } from "obsidian";
import type AISearchPlugin from "../main";
import type { SearchResult, SearchViewState } from "../types";
import { parseQuery } from "../indexer/query-parser";
import { DEBOUNCE_MS } from "../constants";
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
	view: ItemView;
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
	const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
		[plugin],
	);

	const handleResultClick = useCallback(
		(result: SearchResult) => {
			void app.workspace.openLinkText(result.path, "", false);
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

	const searchTerms = useMemo(() => {
		const parsed = parseQuery(state.query);
		return parsed.text
			.split(/\s+/)
			.filter((t) => t.length > 0);
	}, [state.query]);

	const showAIButton =
		plugin.settings.enableAI &&
		plugin.settings.claudeApiKey.length > 0 &&
		state.results.length > 0;

	return (
		<div class="ai-search-container">
			<SearchInput
				value={state.query}
				onInput={handleSearch}
				isSearching={state.isSearching}
			/>

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
				results={state.results}
				showScores={plugin.settings.showScores}
				searchTerms={searchTerms}
				onResultClick={handleResultClick}
				onResultHover={handleResultHover}
			/>
		</div>
	);
}
