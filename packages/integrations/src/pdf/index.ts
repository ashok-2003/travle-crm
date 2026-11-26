// Public API of @travel-crm/integrations/pdf: the React-PDF renderer and its templates (spec 9.3).
export type {
  DocumentBranding,
  PdfInput,
  PdfTemplate,
  QuotationDocumentData,
  SampleDocumentData,
} from "./document-input.js";
export { imageOf, isSafeToDraw, type ImageHeader } from "./image-type.js";
export type { PlatformInvoiceData, RenderPlatformInvoice } from "./platform-invoice-input.js";
export { jpegForDrawing } from "./jpeg.js";
export {
  characterLabel,
  printableCharacters,
  UnprintableTextError,
  unprintableCharacters,
  unprintableCharactersIn,
} from "./printable-text.js";
export { renderPdf } from "./render-pdf.js";
export { renderPlatformInvoice } from "./render-platform-invoice.js";
