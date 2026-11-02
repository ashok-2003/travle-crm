// The words of a document the agency gives its AI (packages, prices, policies): a PDF's text, read with unpdf, or a plain-text
// file as it is. Images and scans have no text here.

/** The document's text, at most `maxCharacters`; null for a kind it can't read. */
export async function documentText(
  bytes: Uint8Array,
  contentType: string,
  maxCharacters = 60_000,
): Promise<string | null> {
  if (contentType === "text/plain") return new TextDecoder().decode(bytes).slice(0, maxCharacters);
  if (contentType !== "application/pdf") return null;
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxCharacters);
}

/**
 * A PDF's text page by page (a page with no text is an empty string), each page cut to `maxCharacters`; a rate sheet is read a
 * few pages at a time. Null for anything but a PDF.
 */
export async function documentPages(
  bytes: Uint8Array,
  contentType: string,
  maxCharacters = 60_000,
): Promise<string[] | null> {
  if (contentType !== "application/pdf") return null;
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((page) =>
    page
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxCharacters),
  );
}
