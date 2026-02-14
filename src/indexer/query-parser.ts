import type { ParsedQuery, DateFilter } from "../types";
import { RESERVED_PREFIXES } from "../constants";

/**
 * Parses a query string supporting Obsidian-like syntax:
 *   path:folder      - match path of the file
 *   file:term        - match file name
 *   tag:term         - search for tags (also #tag)
 *   line:(foo bar)   - search keywords on same line
 *   section:(foo bar)- search keywords under same heading
 *   [property]:value - match property
 *   #tag             - filter by tag
 *   -#tag            - exclude notes with tag
 *   -word            - exclude results containing word
 *   "exact phrase"   - exact phrase match
 *   title:term       - alias for file:
 *   heading:term     - filter by heading content
 *   folder:folder    - alias for path:
 *   created:>date    - created after date
 *   modified:<date   - modified before date
 *   free text        - full-text search terms
 */
export function parseQuery(raw: string): ParsedQuery {
	const tags: string[] = [];
	const excludedTags: string[] = [];
	const excludedTerms: string[] = [];
	const paths: string[] = [];
	const fileTerms: string[] = [];
	const headingTerms: string[] = [];
	const lineQueries: string[][] = [];
	const sectionQueries: string[][] = [];
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

	// Extract line queries: line:(term1 term2) — parenthesised groups first
	text = text.replace(/line:\(([^)]+)\)/gi, (_match, content: string) => {
		const terms = content.trim().split(/\s+/).filter((t) => t.length > 0);
		if (terms.length > 0) lineQueries.push(terms);
		return "";
	});
	// line:singleterm
	text = text.replace(/line:([^\s]+)/gi, (_match, term: string) => {
		lineQueries.push([term]);
		return "";
	});

	// Extract section queries: section:(term1 term2)
	text = text.replace(/section:\(([^)]+)\)/gi, (_match, content: string) => {
		const terms = content.trim().split(/\s+/).filter((t) => t.length > 0);
		if (terms.length > 0) sectionQueries.push(terms);
		return "";
	});
	// section:singleterm
	text = text.replace(/section:([^\s]+)/gi, (_match, term: string) => {
		sectionQueries.push([term]);
		return "";
	});

	// Extract path filters: path:some/folder
	text = text.replace(/path:([^\s]+)/gi, (_match, path: string) => {
		paths.push(path);
		return "";
	});

	// Extract folder filters: folder:some/folder (alias for path:)
	text = text.replace(/folder:([^\s]+)/gi, (_match, path: string) => {
		paths.push(path);
		return "";
	});

	// Extract file name filters: file:term
	text = text.replace(/file:([^\s]+)/gi, (_match, term: string) => {
		fileTerms.push(term);
		return "";
	});

	// Extract title filters: title:term (alias for file:)
	text = text.replace(/title:([^\s]+)/gi, (_match, term: string) => {
		fileTerms.push(term);
		return "";
	});

	// Extract tag prefix filters: tag:term or tag:#term
	text = text.replace(/tag:([^\s]+)/gi, (_match, term: string) => {
		// Strip leading # if present
		const tag = term.startsWith("#") ? term.slice(1) : term;
		if (tag.length > 0) tags.push(tag);
		return "";
	});

	// Extract heading filters: heading:term
	text = text.replace(/heading:([^\s]+)/gi, (_match, term: string) => {
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

	// Extract [property]:value or [property] frontmatter filters
	text = text.replace(/\[([^\]]+)\]:?(\S*)/g, (_match, key: string, value: string) => {
		frontmatter[key] = value || "";
		return "";
	});

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
		fileTerms,
		headingTerms,
		lineQueries,
		sectionQueries,
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
