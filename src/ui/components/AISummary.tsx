interface AISummaryProps {
	summary: string;
}

export function AISummary({ summary }: AISummaryProps) {
	return (
		<div class="ai-search-summary">
			<div class="ai-search-summary-header">AI summary</div>
			<div class="ai-search-summary-content">{summary}</div>
		</div>
	);
}
