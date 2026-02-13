import type { ParsedQuery, DateFilter } from "../types";
import { RESERVED_PREFIXES } from "../constants";

/**
 * Parses a query string supporting Obsidian-like syntax:
 *   #tag            - filter by tag
 *   -#tag           - exclude notes with tag
 *   -word           - exclude results containing word
 *   path:folder     - filter by folder path
 *   folder:folder   - alias for path:
 *   heading:term    - filter by heading content
 *   property:value  - filter by frontmatter property
 *   created:>date   - created after date
 *   created:<date   - created before date
 *   created:date    - created on date
 *   modified:>date / modified:<date / modified:date
 *   "exact phrase"  - exact phrase match
 *   free text       - full-text search terms
 */
export function parseQuery(raw: string): ParsedQuery {
	const tags: string[] = [];
	const excludedTags: string[] = [];
	const excludedTerms: string[] = [];
	const paths: string[] = [];
	const headingTerms: string[] = [];
	const dateFilters: DateFilter[] = [];
	const phrases: string[] = [];
	const frontmatter: Record<string, string> = {};
	let text = raw;

	// Extract exact phrases: "some phrase"
	text = text.replace(/"([^"]+)"/g, (_match, phrase: string) => {
		phrases.push(phrase);
		return "";
	});

	// Extract negated tags: -#tagname
	text = text.replace(/-#([a-zA-Z0-9_\-/]+)/g, (_match, tag: string) => {
		excludedTags.push(tag);
		return "";
	});

	// Extract tags: #tagname (supports nested tags like #parent/child)
	text = text.replace(/#([a-zA-Z0-9_\-/]+)/g, (_match, tag: string) => {
		tags.push(tag);
		return "";
	});

	// Extract path filters: path:some/folder
	text = text.replace(/path:([^\s]+)/g, (_match, path: string) => {
		paths.push(path);
		return "";
	});

	// Extract folder filters: folder:some/folder (alias for path:)
	text = text.replace(/folder:([^\s]+)/g, (_match, path: string) => {
		paths.push(path);
		return "";
	});

	// Extract heading filters: heading:term
	text = text.replace(/heading:([^\s]+)/g, (_match, term: string) => {
		headingTerms.push(term);
		return "";
	});

	// Extract date filters: created:>2024-01-01, created:<2024-01-01, created:2024-01-01
	text = text.replace(
		/created:([<>]?)(\d{4}-\d{2}-\d{2})/g,
		(_match, op: string, date: string) => {
			dateFilters.push({
				field: "created",
				operator: opToOperator(op),
				date,
			});
			return "";
		},
	);

	text = text.replace(
		/modified:([<>]?)(\d{4}-\d{2}-\d{2})/g,
		(_match, op: string, date: string) => {
			dateFilters.push({
				field: "modified",
				operator: opToOperator(op),
				date,
			});
			return "";
		},
	);

	// Extract frontmatter property filters: key:value (any remaining word:word pattern)
	text = text.replace(/([a-zA-Z_][a-zA-Z0-9_]*):([^\s]+)/g, (_match, key: string, value: string) => {
		if (RESERVED_PREFIXES.has(key.toLowerCase())) {
			// Don't consume reserved prefixes that weren't matched above
			return _match;
		}
		frontmatter[key] = value;
		return "";
	});

	// Extract negated terms: -word (must come after other prefix extractions)
	text = text.replace(/(?:^|\s)-([a-zA-Z0-9_\-]+)/g, (_match, term: string) => {
		excludedTerms.push(term);
		return "";
	});

	// Clean up remaining whitespace
	text = text.replace(/\s+/g, " ").trim();

	return {
		text,
		phrases,
		tags,
		excludedTags,
		excludedTerms,
		paths,
		headingTerms,
		frontmatter,
		dateFilters,
		useSemantic: false,
	};
}

function opToOperator(op: string): "before" | "after" | "on" {
	if (op === ">") return "after";
	if (op === "<") return "before";
	return "on";
}
