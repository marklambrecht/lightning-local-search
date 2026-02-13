import type { ComponentChildren } from "preact";
import type { SearchResult } from "../../types";

interface ResultCardProps {
	result: SearchResult;
	showScore: boolean;
	searchTerms: string[];
	excerptLines: number;
	isSelected: boolean;
	onClick: (e: MouseEvent) => void;
	onHover: (event: MouseEvent, targetEl: HTMLElement, path: string) => void;
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
	excerptLines,
	isSelected,
	onClick,
	onHover,
}: ResultCardProps) {
	const classes = `ai-search-result-card${isSelected ? " ai-search-result-selected" : ""}`;
	return (
		<div
			class={classes}
			onClick={(e) => onClick(e as unknown as MouseEvent)}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === "Enter") onClick(e as unknown as MouseEvent);
			}}
		>
			<div class="ai-search-result-header">
				<span class="ai-search-result-title">
					{highlightTerms(result.title, searchTerms)}
				</span>
				<div class="ai-search-result-actions">
					{showScore && (
						<span class="ai-search-result-score">
							{Math.round(result.score * 100)}%
						</span>
					)}
					<span
						class="ai-search-preview-icon"
						title="Preview note"
						onMouseEnter={(e) => {
							e.stopPropagation();
							const target = e.currentTarget as HTMLElement;
							onHover(e as unknown as MouseEvent, target, result.path);
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					</span>
				</div>
			</div>
			{result.folder && (
				<div class="ai-search-result-path">{result.folder}</div>
			)}
			{result.excerpt && (
				<div
					class="ai-search-result-excerpt"
					style={{ WebkitLineClamp: excerptLines }}
				>
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
