// What kind of image a logo's bytes really are. Storage checks only the type the browser declared, so a renamed file
// can arrive, and React-PDF silently leaves out an image it can't read.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return bytes.byteLength >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

/** "image/png" or "image/jpeg", from the file's own signature; null for anything else. */
export function imageTypeOf(bytes: Uint8Array): "image/png" | "image/jpeg" | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "image/png";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "image/jpeg";
  return null;
}
