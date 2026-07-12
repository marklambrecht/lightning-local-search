import { useState } from "preact/hooks";
import type { SearchResult } from "../../types";
import { ResultCard } from "./ResultCard";

export interface ResultGroup {
	key: string;
	label: string;
	results: SearchResult[];
}

interface ResultGroupsProps {
	groups: ResultGroup[];
	/** When false, render a flat list with no section headers. */
	grouped: boolean;
	showScores: boolean;
	searchTerms: string[];
	excerptLines: number;
	/** Index into the flattened display order (groups concatenated). */
	selectedIndex: number;
	onResultClick: (result: SearchResult, e: MouseEvent) => void;
	onResultDoubleClick?: (result: SearchResult, e: MouseEvent) => void;
	onResultHover: (event: MouseEvent, targetEl: HTMLElement, path: string) => void;
}

export function ResultGroups({
	groups,
	grouped,
	showScores,
	searchTerms,
	excerptLines,
	selectedIndex,
	onResultClick,
	onResultDoubleClick,
	onResultHover,
}: ResultGroupsProps) {
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	if (groups.length === 0) return null;

	const toggle = (key: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	// Running offset so each card's index matches the flattened display order
	// that the keyboard navigation (selectedIndex) works against.
	let offset = 0;

	if (!grouped) {
		const results = groups[0]?.results ?? [];
		return (
			<div class="ai-search-results">
				{results.map((result, index) => (
					<ResultCard
						key={result.path}
						result={result}
						showScore={showScores}
						searchTerms={searchTerms}
						excerptLines={excerptLines}
						isSelected={index === selectedIndex}
						onClick={(e) => onResultClick(result, e)}
						onDoubleClick={(e) => onResultDoubleClick?.(result, e)}
						onHover={onResultHover}
					/>
				))}
			</div>
		);
	}

	return (
		<div class="ai-search-results ai-search-results-grouped">
			{groups.map((group) => {
				const base = offset;
				offset += group.results.length;
				const isCollapsed = collapsed.has(group.key);
				return (
					<section key={group.key} class="ai-search-group">
						<button
							class="ai-search-group-header"
							onClick={() => toggle(group.key)}
							aria-expanded={!isCollapsed}
						>
							<span class={`ai-search-group-caret${isCollapsed ? " is-collapsed" : ""}`}>
								▾
							</span>
							<span class="ai-search-group-label">{group.label}</span>
							<span class="ai-search-group-count">{group.results.length}</span>
						</button>
						{!isCollapsed && (
							<div class="ai-search-group-body">
								{group.results.map((result, i) => {
									const globalIndex = base + i;
									return (
										<ResultCard
											key={result.path}
											result={result}
											showScore={showScores}
											searchTerms={searchTerms}
											excerptLines={excerptLines}
											isSelected={globalIndex === selectedIndex}
											onClick={(e) => onResultClick(result, e)}
											onDoubleClick={(e) => onResultDoubleClick?.(result, e)}
											onHover={onResultHover}
										/>

									);
								})}
							</div>
						)}
					</section>
				);
			})}
		</div>
	);
}
