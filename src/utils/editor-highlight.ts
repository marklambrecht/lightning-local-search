import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { MarkdownView } from "obsidian";

const addHighlightEffect = StateEffect.define<{ from: number; to: number }[]>();
const clearHighlightEffect = StateEffect.define<void>();

const highlightMark = Decoration.mark({ class: "ai-search-temp-highlight" });

const highlightField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		deco = deco.map(tr.changes);
		for (const e of tr.effects) {
			if (e.is(addHighlightEffect)) {
				const marks = e.value.map((r) =>
					highlightMark.range(r.from, r.to),
				);
				deco = Decoration.set(marks, true);
			}
			if (e.is(clearHighlightEffect)) {
				deco = Decoration.none;
			}
		}
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

/**
 * Temporarily highlights all occurrences of search terms in an open note
 * and scrolls to the first match. Highlights auto-clear after `durationMs`.
 */
export function highlightAndScrollToMatch(
	markdownView: MarkdownView,
	terms: string[],
	durationMs = 3000,
): void {
	if (terms.length === 0) return;

	const editor = markdownView.editor;
	const cmView = (editor as unknown as { cm: EditorView }).cm;
	if (!cmView) return;

	// Install the highlight StateField if not already present
	if (!cmView.state.field(highlightField, false)) {
		cmView.dispatch({
			effects: StateEffect.appendConfig.of(highlightField),
		});
	}

	// Find all match positions in the raw document
	const content = cmView.state.doc.toString();
	const ranges: { from: number; to: number }[] = [];

	for (const term of terms) {
		if (term.length === 0) continue;
		const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const pattern = new RegExp(escaped, "gi");
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content)) !== null) {
			ranges.push({ from: match.index, to: match.index + match[0].length });
		}
	}

	if (ranges.length === 0) return;

	// Sort by position and deduplicate overlapping ranges
	ranges.sort((a, b) => a.from - b.from);

	// Add highlights
	cmView.dispatch({ effects: addHighlightEffect.of(ranges) });

	// Scroll to first match (centered in viewport)
	const first = ranges[0]!;
	cmView.dispatch({
		effects: EditorView.scrollIntoView(first.from, { y: "center" }),
	});

	// Clear highlights after duration
	setTimeout(() => {
		try {
			if (cmView.state.field(highlightField, false) !== undefined) {
				cmView.dispatch({ effects: clearHighlightEffect.of(undefined) });
			}
		} catch {
			// Editor may have been closed
		}
	}, durationMs);
}
