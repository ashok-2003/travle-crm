// Field rules shared by the identity inputs and outputs: one definition for each kind of value.
import { z } from "zod";

/** An organization's sign-in code, e.g. SHARMA. People may type it in any case; it is compared in capitals. */
export const organizationCode = z
  .string()
  .trim()
  // Checked before upper-casing: Unicode case mapping turns letters like "ſ" into "S".
  .regex(/^[A-Za-z0-9]{3,12}$/, "Use 3-12 letters or digits")
  .toUpperCase();

/** A username within an organization, e.g. "Ravi" or "ravi.k". Kept as typed for display, compared without case. */
export const staffUsername = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{2,32}$/, "Use 2-32 letters, digits, dots, dashes or underscores");

/**
 * An email address someone typed, in lower case (Better Auth looks emails up in lower case). Addresses under the
 * reserved .invalid domain are refused: no real mailbox has one, and staff without email get such a placeholder.
 */
export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email())
  .refine((email) => !email.endsWith(".invalid"), "Use a real email address");

/** An email address the API shows. Never a placeholder, so a leaked placeholder fails the response instead. */
export const shownEmailAddress = z
  .string()
  .max(254)
  .pipe(z.email())
  .refine((email) => !email.toLowerCase().endsWith(".invalid"), "Placeholder email shown");

/** Control and format characters (zero-width spaces, bidi overrides) make names invisible or misleading. */
const hasNoHiddenCharacters = (text: string) => !/\p{C}/u.test(text);

/** A person's name as shown in the app. */
export const personName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine(hasNoHiddenCharacters, "Use visible characters only");

/** A password typed at sign-in or as the current password. Better Auth checks it; only its length is limited here. */
export const passwordAttempt = z.string().min(1).max(128);

/** A new password: 10 to 128 characters, the limits createAuth gives Better Auth. Used exactly as typed. */
export const newPassword = z.string().min(10, "Use at least 10 characters").max(128);

/** A role's stable key, e.g. "sales". Matches the database's role_key_format check. */
export const roleKey = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/);

/** A role's display name, e.g. "Senior sales". */
export const roleName = z.string().trim().min(1).max(40).refine(hasNoHiddenCharacters, "Use visible characters only");

/** The id of a row, a UUID v7. */
export const recordId = z.uuid();
