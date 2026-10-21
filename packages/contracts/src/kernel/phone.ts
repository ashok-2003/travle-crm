// Phone numbers, saved in E.164 (spec 9.6): "+919876543210", whatever form people type them in. India is the
// default country, so "98765 43210" and "09876543210" both work.
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { z } from "zod";

/**
 * The number in E.164, or null when the text isn't a valid number. Extensions are refused rather than dropped:
 * E.164 can't hold them. Uses libphonenumber's full metadata, so a number's range is checked as well as its length.
 */
export function toE164(text: string, defaultCountry: CountryCode = "IN"): string | null {
  const parsed = parsePhoneNumberFromString(text, defaultCountry);
  if (!parsed?.isValid() || parsed.ext !== undefined) return null;
  return parsed.number;
}

/** A phone number typed into a form, saved in E.164. */
export const phoneNumber = z
  .string()
  .max(40)
  .transform((text, context) => {
    const e164 = toE164(text);
    if (e164 === null) {
      context.issues.push({ code: "custom", message: "Use a phone number like 98765 43210", input: text });
      return z.NEVER;
    }
    return e164;
  });

/**
 * A stored number written the international way, as a file shows it (B38): "+91 98765 43210", or a foreign number
 * with its own country's spacing. One libphonenumber doesn't know is shown as stored.
 */
export function internationalPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
