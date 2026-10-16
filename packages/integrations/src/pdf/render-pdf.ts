// Renders a document to PDF bytes. The worker calls it (spec 9.3); an issued document's PDF is rendered once.
import type { PdfInput, PdfTemplate } from "./document-input.js";
import { imageOf } from "./image-type.js";
import { jpegForDrawing } from "./jpeg.js";
import { normalisedText, UnprintableTextError, unprintableCharactersIn } from "./printable-text.js";

// React-PDF, the fonts and the templates are loaded when a document is first rendered, not when this module is
// imported: code that only checks text or reads document types (the domain) never evaluates React-PDF.
const templates = {
  sample: async () => (await import("./templates/sample-document.js")).sampleDocument,
} satisfies Record<PdfTemplate, unknown>;

/** The same value with every string normalised for printing. Bytes (a logo) and dates are kept as they are. */
function normalised<T>(value: T): T {
  if (typeof value === "string") return normalisedText(value) as T;
  if (value instanceof Uint8Array || value instanceof Date || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normalised) as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalised(entry)])) as T;
}

/** The logo as React-PDF is given it: a JPEG with only the segments that draw it (jpeg.ts), a PNG as it is. */
function drawnLogo(logo: PdfInput["branding"]["logo"]): PdfInput["branding"]["logo"] {
  if (logo === undefined) return undefined;
  if (imageOf(logo.data)?.contentType !== logo.contentType) {
    throw new RangeError("Logos are PNG or JPEG images, and their bytes must be the type they say");
  }
  if (logo.contentType === "image/png") return logo;
  const data = jpegForDrawing(logo.data);
  if (data === null) throw new RangeError("This JPEG's segments can't be drawn as they are");
  return { ...logo, data };
}

/**
 * Renders one template. Rejects before rendering anything when the branding's accent colour isn't #rrggbb or its logo
 * isn't the PNG or JPEG its type says (React-PDF would leave it out without a word), or is a JPEG whose segments
 * can't be drawn as they are, and with UnprintableTextError when some text holds characters the fonts can't show. A
 * JPEG logo is drawn without its metadata. Text is printed in its composed (NFC) form with \n line endings, and the
 * output depends only on the input, including `issuedAt`.
 */
export async function renderPdf(template: PdfTemplate, rawInput: PdfInput): Promise<Uint8Array> {
  const logo = drawnLogo(rawInput.branding.logo);
  const input = normalised(logo === undefined ? rawInput : { ...rawInput, branding: { ...rawInput.branding, logo } });
  const unprintable = unprintableCharactersIn(input);
  if (unprintable.length > 0) throw new UnprintableTextError(unprintable);
  const [{ renderToBuffer }, { registerBrandFonts }, buildDocument] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./fonts.js"),
    templates[template](),
  ]);
  registerBrandFonts();
  const pdf = await renderToBuffer(buildDocument(input));
  // A plain Uint8Array, not Node's Buffer subclass: storage adapters and PDF readers take it as it is.
  return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
}
