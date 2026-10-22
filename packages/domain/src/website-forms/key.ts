// The form's key (W4, ruling F12): the organization's id as 22 base64url characters, then 16 random ones. The id lets the
// api open the right organization with no lookup across organizations; the random part only stops guessing a form that
// was never shared, and lets the Owner replace the link.
import { randomBytes } from "node:crypto";
import { FORM_KEY_LENGTH } from "@travel-crm/contracts/website-forms";
import { isUuid } from "../kernel/index.js";

const SECRET_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const SECRET_LENGTH = 16;
const ID_LENGTH = 22;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const KEY_PATTERN = /^[A-Za-z0-9_-]{38}$/;

/** 16 characters of A-Za-z0-9_- from the system's random bytes: 64 characters, so no byte is favoured. */
export function newKeySecret(): string {
  return Array.from(randomBytes(SECRET_LENGTH), (byte) => SECRET_ALPHABET.charAt(byte % 64)).join("");
}

function idPart(organizationId: string): string {
  return Buffer.from(organizationId.replaceAll("-", ""), "hex").toString("base64url");
}

function uuidOf(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The key in a form's link: 38 characters. */
export function formKeyOf(organizationId: string, keySecret: string): string {
  if (!isUuid(organizationId)) throw new RangeError("A form key needs an organization id");
  if (!SECRET_PATTERN.test(keySecret)) throw new RangeError("A form key needs a 16-character secret");
  const key = idPart(organizationId) + keySecret;
  if (key.length !== FORM_KEY_LENGTH) throw new RangeError("A form key is 38 characters");
  return key;
}

/** The organization's id and the random part, or null for anything that is not a key this module made. */
export function parseFormKey(key: string): { organizationId: string; keySecret: string } | null {
  if (!KEY_PATTERN.test(key)) return null;
  const encodedId = key.slice(0, ID_LENGTH);
  const bytes = Buffer.from(encodedId, "base64url");
  // base64url has several spellings for the same bytes; only the one formKeyOf writes is a key.
  if (bytes.length !== 16 || bytes.toString("base64url") !== encodedId) return null;
  const organizationId = uuidOf(bytes.toString("hex"));
  return isUuid(organizationId) ? { organizationId, keySecret: key.slice(ID_LENGTH) } : null;
}
