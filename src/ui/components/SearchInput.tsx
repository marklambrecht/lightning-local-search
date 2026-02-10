interface SearchInputProps {
	value: string;
	onInput: (query: string) => void;
	isSearching: boolean;
}

export function SearchInput({ value, onInput, isSearching }: SearchInputProps) {
	return (
		<div class="ai-search-input-container">
			<input
				type="text"
				class="ai-search-input"
				placeholder="Search notes... (#tag, path:folder, created:>date)"
				value={value}
				onInput={(e) =>
					onInput((e.target as HTMLInputElement).value)
				}
				spellcheck={false}
			/>
			{isSearching && <div class="ai-search-spinner" />}
		</div>
	);
}
