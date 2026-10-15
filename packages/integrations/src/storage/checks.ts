// Checks every ObjectStorage adapter makes before it touches a key, a size or an expiry, so both adapters refuse the
// same things.

/** S3's longest key. */
const MAX_KEY_BYTES = 1024;
/** S3's longest presigned URL lifetime: 7 days. */
export const MAX_EXPIRY_SECONDS = 604_800;

/** Refuses keys that are empty, too long, absolute, hold an empty, "." or ".." segment, or a control character or backslash. */
export function assertSafeKey(key: string): void {
  if (key === "") throw new RangeError("A storage key can't be empty");
  if (new TextEncoder().encode(key).byteLength > MAX_KEY_BYTES) {
    throw new RangeError(`A storage key can't be longer than ${String(MAX_KEY_BYTES)} bytes`);
  }
  for (let index = 0; index < key.length; index += 1) {
    if (isControlOrBackslash(key.charCodeAt(index))) {
      throw new RangeError("A storage key can't hold control characters or backslashes");
    }
  }
  if (key.startsWith("/")) throw new RangeError("A storage key can't start with /");
  if (key.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new RangeError("A storage key can't have an empty, . or .. segment");
  }
}

/**
 * A folder to delete everything under: a safe key ending in "/", two levels deep at least ("organizations/<id>/"), so
 * a mistaken prefix can never be empty or a whole top-level folder such as every organization's files.
 */
export function assertSafePrefix(prefix: string): void {
  if (!prefix.endsWith("/")) throw new RangeError("A storage prefix ends with /");
  const folder = prefix.slice(0, -1);
  assertSafeKey(folder);
  if (folder.split("/").length < 2) throw new RangeError("A storage prefix is at least two folders deep");
}

function isControlOrBackslash(code: number): boolean {
  return code <= 0x1f || code === 0x7f || code === 0x5c;
}

export function assertPositiveSize(sizeBytes: number): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new RangeError("A file's size must be a positive whole number of bytes");
  }
}

export function assertExpiry(expiresInSeconds: number): void {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0 || expiresInSeconds > MAX_EXPIRY_SECONDS) {
    throw new RangeError(`A URL's lifetime must be 1 to ${String(MAX_EXPIRY_SECONDS)} seconds`);
  }
}
