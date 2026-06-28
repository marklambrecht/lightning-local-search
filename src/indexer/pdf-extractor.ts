import { MAX_EXTRACTED_CHARS } from "../constants";

/**
 * Minimal shape of the pdf.js API we use. Typed locally so we don't depend on
 * pdfjs-dist type packages, and so the module can be loaded lazily.
 */
interface PdfTextItem {
	str?: string;
	hasEOL?: boolean;
}
interface PdfTextContent {
	items: PdfTextItem[];
}
interface PdfPage {
	getTextContent(): Promise<PdfTextContent>;
}
interface PdfDocument {
	numPages: number;
	getPage(pageNumber: number): Promise<PdfPage>;
	destroy(): Promise<void>;
}
interface PdfjsModule {
	getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDocument> };
}

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * Lazily loads pdf.js (the legacy build, for broad compatibility) and wires it
 * to run its worker on the main thread. Importing `pdf.worker.mjs` registers
 * `globalThis.pdfjsWorker`, which pdf.js detects and uses as a "fake worker" —
 * avoiding the need to resolve a separate worker file at runtime inside the
 * bundled plugin. Extraction is invoked from the streaming indexer, which
 * yields between files, and large files are capped before they reach here.
 */
async function loadPdfjs(): Promise<PdfjsModule> {
	if (!pdfjsPromise) {
		pdfjsPromise = (async () => {
			// Side-effect import: registers globalThis.pdfjsWorker.
			await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
			const pdfjs = (await import(
				"pdfjs-dist/legacy/build/pdf.mjs"
			)) as unknown as PdfjsModule;
			return pdfjs;
		})();
	}
	return pdfjsPromise;
}

/**
 * Extracts the text layer from a PDF. Returns an empty string for PDFs without
 * an embedded text layer (e.g. scans) — those would require OCR, which is out
 * of scope. Throws are caught by the caller so a single bad PDF never breaks
 * the whole index build.
 */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
	const pdfjs = await loadPdfjs();
	const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
	try {
		const parts: string[] = [];
		let total = 0;
		for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
			const page = await doc.getPage(pageNum);
			const content = await page.getTextContent();
			for (const item of content.items) {
				if (item.str) {
					parts.push(item.str);
					total += item.str.length;
					if (item.hasEOL) parts.push("\n");
				}
			}
			// Stop early once we've gathered enough text to index.
			if (total >= MAX_EXTRACTED_CHARS) break;
		}
		return parts.join(" ").replace(/[ \t]+/g, " ").slice(0, MAX_EXTRACTED_CHARS);
	} finally {
		await doc.destroy();
	}
}
