// The Content-Disposition a presigned download sends, so the browser saves the file under its own name.

/**
 * `attachment; filename="…"; filename*=UTF-8''…` (RFC 6266): browsers use the UTF-8 name, so Hindi names and quotes
 * survive; the plain name is an ASCII fallback with anything risky replaced, so it can't break out of its quotes.
 */
export function attachmentDisposition(fileName: string): string {
  // A lone surrogate would make encodeURIComponent throw: it becomes U+FFFD, and "_" in the ASCII fallback.
  const wellFormed = fileName.toWellFormed();
  const fallback = wellFormed.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(wellFormed).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
