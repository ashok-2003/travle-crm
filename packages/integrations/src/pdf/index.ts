// Public API of @travel-crm/integrations/pdf: the React-PDF renderer and its templates (spec 9.3).
export type { DocumentBranding, PdfInput, PdfTemplate, SampleDocumentData } from "./document-input.js";
export { printableCharacters, UnprintableTextError, unprintableCharacters } from "./printable-text.js";
export { renderPdf } from "./render-pdf.js";
