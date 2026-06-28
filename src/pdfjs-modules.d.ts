// pdf.js legacy build subpaths aren't covered by the package's type exports.
// We import them dynamically and cast to a local interface, so `any` is fine.
declare module "pdfjs-dist/legacy/build/pdf.mjs";
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
