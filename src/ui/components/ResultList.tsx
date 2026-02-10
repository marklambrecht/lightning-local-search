import type { SearchResult } from "../../types";
import { ResultCard } from "./ResultCard";

interface ResultListProps {
	results: SearchResult[];
	showScores: boolean;
	onResultClick: (result: SearchResult) => void;
}

export function ResultList({
	results,
	showScores,
	onResultClick,
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
					onClick={() => onResultClick(result)}
				/>
			))}
		</div>
	);
}
