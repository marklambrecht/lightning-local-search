import type { RefObject } from "preact";

interface SearchInputProps {
	value: string;
	onInput: (query: string) => void;
	onFocus?: () => void;
	onBlur?: () => void;
	isSearching: boolean;
	inputRef?: RefObject<HTMLInputElement>;
}

export function SearchInput({ value, onInput, onFocus, onBlur, isSearching, inputRef }: SearchInputProps) {
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
			/>
			{isSearching && <div class="ai-search-spinner" />}
		</div>
	);
}
