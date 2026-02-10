import type { SearchResult } from "../../types";
import { ResultCard } from "./ResultCard";

interface ResultListProps {
	results: SearchResult[];
	showScores: boolean;
	searchTerms: string[];
	onResultClick: (result: SearchResult) => void;
	onResultHover: (event: MouseEvent, targetEl: HTMLElement, path: string) => void;
}

export function ResultList({
	results,
	showScores,
	searchTerms,
	onResultClick,
	onResultHover,
}: ResultListProps) {
	if (results.length === 0) {
		return null;
	}

	return (
		<div class="ai-search-results">
			<div class="ai-search-result-count">
				{results.length} result{results.length !== 1 ? "s" : ""}
			</div>
			{results.map((result) => (
				<ResultCard
					key={result.path}
					result={result}
					showScore={showScores}
					searchTerms={searchTerms}
					onClick={() => onResultClick(result)}
					onHover={onResultHover}
				/>
			))}
		</div>
	);
}
