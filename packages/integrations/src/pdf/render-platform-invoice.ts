// Renders the platform's invoice to PDF bytes; the console's invoice creation calls it (the console invoices spec).
import type { PlatformInvoiceData, RenderPlatformInvoice } from "./platform-invoice-input.js";
import { UnprintableTextError, unprintableCharactersIn } from "./printable-text.js";
import { normalised } from "./render-pdf.js";

/**
 * Rejects with UnprintableTextError, before rendering, when some text holds characters the fonts can't show. Text is
 * printed in its composed form, and the output depends only on the input, including `issuedAt`. React-PDF and the
 * fonts load on the first render, as renderPdf's do.
 */
export const renderPlatformInvoice: RenderPlatformInvoice = async (rawData: PlatformInvoiceData, issuedAt: Date) => {
  const data = normalised(rawData);
  const unprintable = unprintableCharactersIn(data);
  if (unprintable.length > 0) throw new UnprintableTextError(unprintable);
  const [{ renderToBuffer }, { registerBrandFonts }, { platformInvoice }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./fonts.js"),
    import("./templates/platform-invoice.js"),
  ]);
  registerBrandFonts();
  const pdf = await renderToBuffer(platformInvoice(data, issuedAt));
  // A plain Uint8Array, not Node's Buffer subclass: storage adapters and PDF readers take it as it is.
  return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
};
