// Share-link tokens: the organization's id in the clear, then a random secret. The id lets /p/<token> open the right
// organization with db.forOrg() (no lookup across organizations); only the secret's hash is stored.
import { createHash, randomBytes } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 16 bytes of organization id and 32 random bytes, in base64url: 22 + 43 characters. */
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{22})([A-Za-z0-9_-]{43})$/;

/** What is stored for a secret: its sha256, in hex. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** A new token for an organization: its id in the clear, then a random secret. Only the secret's hash is stored. */
export function newShareLinkToken(organizationId: string): { token: string; secretHash: string } {
  if (!UUID_PATTERN.test(organizationId)) {
    throw new RangeError(`Not an organization id: ${JSON.stringify(organizationId.slice(0, 64))}`);
  }
  const organizationPart = Buffer.from(organizationId.replaceAll("-", ""), "hex").toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return { token: organizationPart + secret, secretHash: hashSecret(secret) };
}

/** The organization a token names and its secret's hash, or null when it is not a well-formed token. */
export function parseShareLinkToken(token: string): { organizationId: string; secretHash: string } | null {
  const match = TOKEN_PATTERN.exec(token);
  const organizationPart = match?.[1];
  const secret = match?.[2];
  if (organizationPart === undefined || secret === undefined) return null;
  const bytes = Buffer.from(organizationPart, "base64url");
  // Base64 leaves spare bits in the last character; only the one encoding counts, so a link has exactly one token.
  if (bytes.length !== 16 || bytes.toString("base64url") !== organizationPart) return null;
  const hex = bytes.toString("hex");
  const organizationId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join(
    "-",
  );
  return { organizationId, secretHash: hashSecret(secret) };
}
