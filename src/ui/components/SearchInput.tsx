import type { RefObject } from "preact";

interface SearchInputProps {
	value: string;
	onInput: (query: string) => void;
	onClear: () => void;
	onFocus?: () => void;
	onBlur?: () => void;
	isSearching: boolean;
	inputRef?: RefObject<HTMLInputElement>;
}

export function SearchInput({ value, onInput, onClear, onFocus, onBlur, isSearching, inputRef }: SearchInputProps) {
	return (
		<div class="ai-search-input-container">
			<input
				ref={inputRef}
				type="text"
				class="ai-search-input"
				placeholder="Search notes... (#tag, path:folder, &quot;phrase&quot;)"
				value={value}
				onInput={(e) =>
					onInput((e.target as HTMLInputElement).value)
				}
				onFocus={onFocus}
				onBlur={onBlur}
				spellcheck={false}
				enterkeyhint="search"
			/>
			{value.length > 0 && !isSearching && (
				<button
					class="ai-search-clear-btn"
					title="Clear search"
					onMouseDown={(e) => {
						e.preventDefault();
						onClear();
					}}
				>
					&times;
				</button>
			)}
			{isSearching && <div class="ai-search-spinner" />}
		</div>
	);
}
