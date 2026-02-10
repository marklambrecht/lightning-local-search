import type { ParsedQuery, DateFilter } from "../types";

/**
 * Parses a query string supporting Obsidian-like syntax:
 *   #tag          - filter by tag
 *   path:folder   - filter by folder path
 *   created:>date - created after date
 *   created:<date - created before date
 *   created:date  - created on date
 *   modified:>date / modified:<date / modified:date
 *   free text     - full-text search terms
 */
export function parseQuery(raw: string): ParsedQuery {
	const tags: string[] = [];
	const paths: string[] = [];
	const dateFilters: DateFilter[] = [];
	let text = raw;

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

	// Clean up remaining whitespace
	text = text.replace(/\s+/g, " ").trim();

	return {
		text,
		tags,
		paths,
		frontmatter: {},
		dateFilters,
		useSemantic: false,
	};
}

function opToOperator(op: string): "before" | "after" | "on" {
	if (op === ">") return "after";
	if (op === "<") return "before";
	return "on";
}
