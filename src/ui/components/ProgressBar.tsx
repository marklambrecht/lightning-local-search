interface ProgressBarProps {
	label: string;
	progress: number;
}

export function ProgressBar({ label, progress }: ProgressBarProps) {
	return (
		<div class="ai-search-progress">
			<div class="ai-search-progress-label">{label}</div>
			<div class="ai-search-progress-bar">
				<div
					class="ai-search-progress-fill"
					style={{ width: `${progress}%` }}
				/>
			</div>
			<div class="ai-search-progress-text">
				{Math.round(progress)}%
			</div>
		</div>
	);
}
