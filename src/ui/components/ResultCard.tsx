import type { ComponentChildren } from "preact";
import type { SearchResult } from "../../types";

interface ResultCardProps {
	result: SearchResult;
	showScore: boolean;
	searchTerms: string[];
	onClick: () => void;
}

function highlightTerms(
	text: string,
	terms: string[],
): ComponentChildren {
	if (terms.length === 0) return text;

	const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
	const parts = text.split(pattern);

	return parts.map((part, i) =>
		pattern.test(part) ? (
			<mark key={i} class="ai-search-highlight">
				{part}
			</mark>
		) : (
			part
		),
	);
}

export function ResultCard({
	result,
	showScore,
	searchTerms,
	onClick,
}: ResultCardProps) {
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
				<span class="ai-search-result-title">
					{highlightTerms(result.title, searchTerms)}
				</span>
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
				<div class="ai-search-result-excerpt">
					{highlightTerms(result.excerpt, searchTerms)}
				</div>
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
