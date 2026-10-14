// Renders a document to PDF bytes. The worker calls it (spec 9.3); an issued document's PDF is rendered once.
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { PdfInput, PdfTemplate } from "./document-input.js";
import { registerBrandFonts } from "./fonts.js";
import { normalisedText, UnprintableTextError, unprintableCharacters } from "./printable-text.js";
import { sampleDocument } from "./templates/sample-document.js";

const templates: Record<PdfTemplate, (input: PdfInput) => ReactElement<DocumentProps>> = {
  sample: sampleDocument,
};

/** Every piece of text in a value: strings, and strings inside arrays and objects. Bytes (a logo) are skipped. */
function textsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value instanceof Uint8Array || value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(textsIn);
}

/** The same value with every string normalised for printing. Bytes (a logo) and dates are kept as they are. */
function normalised<T>(value: T): T {
  if (typeof value === "string") return normalisedText(value) as T;
  if (value instanceof Uint8Array || value instanceof Date || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normalised) as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalised(entry)])) as T;
}

const LOGO_TYPES: readonly string[] = ["image/png", "image/jpeg"];

/**
 * Renders one template. Rejects before rendering anything when the branding's accent colour isn't #rrggbb, and with
 * UnprintableTextError when some text holds characters the fonts can't show. Text is printed in its composed (NFC)
 * form with \n line endings, and the output depends only on the input, including `issuedAt`.
 */
export async function renderPdf(template: PdfTemplate, rawInput: PdfInput): Promise<Uint8Array> {
  const logoType: string | undefined = rawInput.branding.logo?.contentType;
  if (logoType !== undefined && !LOGO_TYPES.includes(logoType)) {
    throw new RangeError("Logos are PNG or JPEG images");
  }
  const input = normalised(rawInput);
  const unprintable = unprintableCharacters(textsIn(input).join(""));
  if (unprintable.length > 0) throw new UnprintableTextError(unprintable);
  registerBrandFonts();
  const document = templates[template](input);
  const pdf = await renderToBuffer(document);
  // A plain Uint8Array, not Node's Buffer subclass: storage adapters and PDF readers take it as it is.
  return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
}
