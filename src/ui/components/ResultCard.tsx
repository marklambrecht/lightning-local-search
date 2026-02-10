import type { SearchResult } from "../../types";

interface ResultCardProps {
	result: SearchResult;
	showScore: boolean;
	onClick: () => void;
}

export function ResultCard({ result, showScore, onClick }: ResultCardProps) {
	return (
		<div
			class="ai-search-result-card"
			onClick={onClick}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter") onClick();
			}}
		>
			<div class="ai-search-result-header">
				<span class="ai-search-result-title">{result.title}</span>
				{showScore && (
					<span class="ai-search-result-score">
						{Math.round(result.score * 100)}%
					</span>
				)}
			</div>
			{result.folder && (
				<div class="ai-search-result-path">{result.folder}</div>
			)}
			{result.excerpt && (
				<div class="ai-search-result-excerpt">{result.excerpt}</div>
			)}
			{result.matchedTags.length > 0 && (
				<div class="ai-search-result-tags">
					{result.matchedTags.map((tag) => (
						<span key={tag} class="ai-search-tag">
							#{tag}
						</span>
					))}
				</div>
			)}
			<div class="ai-search-result-meta">
				Modified: {new Date(result.modifiedAt).toLocaleDateString()}
			</div>
		</div>
	);
}
