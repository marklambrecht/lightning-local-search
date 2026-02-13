import type { SearchResult } from "../../types";
import { ResultCard } from "./ResultCard";

interface ResultListProps {
	results: SearchResult[];
	showScores: boolean;
	searchTerms: string[];
	excerptLines: number;
	selectedIndex: number;
	onResultClick: (result: SearchResult, e: MouseEvent) => void;
	onResultHover: (event: MouseEvent, targetEl: HTMLElement, path: string) => void;
}

export function ResultList({
	results,
	showScores,
	searchTerms,
	excerptLines,
	selectedIndex,
	onResultClick,
	onResultHover,
}: ResultListProps) {
	if (results.length === 0) {
		return null;
	}

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
					onHover={onResultHover}
				/>
			))}
		</div>
	);
}
