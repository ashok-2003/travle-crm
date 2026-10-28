// The Content-Disposition a presigned download sends: the browser saves the file under its own name, or, for a file it can
// show (a photo, a PDF), opens it in place.

/** What a browser may show in place: it runs nothing from these (never SVG, HTML or XML, which carry scripts). */
const INLINE_SAFE = /^(image\/(jpeg|png|webp|gif)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/i;
export const isInlineSafe = (contentType: string): boolean => INLINE_SAFE.test(contentType);

/**
 * `attachment; filename="…"; filename*=UTF-8''…` (RFC 6266): browsers use the UTF-8 name, so Hindi names and quotes
 * survive; the plain name is an ASCII fallback with anything risky replaced, so it can't break out of its quotes.
 * `inline` has the same names but lets the browser show the file where it can.
 */
export function attachmentDisposition(fileName: string, how: "attachment" | "inline" = "attachment"): string {
  // A lone surrogate would make encodeURIComponent throw: it becomes U+FFFD, and "_" in the ASCII fallback.
  const wellFormed = fileName.toWellFormed();
  const fallback = wellFormed.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(wellFormed).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${how}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
