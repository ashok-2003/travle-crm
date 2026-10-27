// The words of a document the agency gives its AI (packages, prices, policies): a PDF's text, read page by page with
// unpdf, or a plain-text file as it is. Spreadsheets are the Spreadsheets port's; images and scans have no text here.

/** The document's text, at most `maxCharacters`; null for a kind it can't read. */
export async function documentText(
  bytes: Uint8Array,
  contentType: string,
  maxCharacters = 60_000,
): Promise<string | null> {
  if (contentType === "text/plain" || contentType === "text/markdown") {
    return new TextDecoder().decode(bytes).slice(0, maxCharacters);
  }
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
