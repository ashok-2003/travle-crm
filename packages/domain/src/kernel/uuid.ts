// Ids: every record's id is a UUID (v7 from Prisma or newUuidV7; v4 and v8 elsewhere), checked the same way everywhere.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value is a UUID of any version, in either case. */
export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * A new UUID v7 (RFC 9562), as Prisma's @default(uuid(7)) makes them, for the rows raw SQL inserts: the millisecond in
 * the first 48 bits, then random bits. Made here rather than with Postgres 18's uuidv7(), so the product runs on
 * Postgres 17 too; Web Crypto, so the kernel stays browser-safe.
 */
export function newUuidV7(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let time = now;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
