// Reads a PDF back as text, the way a person would read it, for checking what a template rendered.
import { extractText, extractTextItems } from "unpdf";

export interface PdfText {
  pages: number;
  /** All pages' text, with runs of whitespace as one space. */
  text: string;
}

/** A run of text on a page and where it sits, in points from the bottom left. */
export interface PlacedText {
  text: string;
  x: number;
  y: number;
  width: number;
}

export async function pdfText(pdf: Uint8Array): Promise<PdfText> {
  // pdf.js takes over the buffer it is given, so it gets a copy.
  const { totalPages, text } = await extractText(Uint8Array.from(pdf), { mergePages: true });
  return { pages: totalPages, text: text.replaceAll(/\s+/g, " ") };
}

/** The first page's runs of text with their positions, for checking layout. */
export async function firstPageText(pdf: Uint8Array): Promise<PlacedText[]> {
  const { items } = await extractTextItems(Uint8Array.from(pdf));
  return (items[0] ?? []).map((item) => ({ text: item.str, x: item.x, y: item.y, width: item.width }));
}
