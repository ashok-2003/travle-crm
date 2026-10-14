// GST registration facts (spec 9.6): the two-digit state codes GSTINs start with and that place of supply uses, and
// GSTINs themselves, checked to the last character. Plan 4's onboarding reads an organization's state and GSTIN.
import { z } from "zod";

/**
 * Every state and union territory by its GST code. Codes 25 (Daman and Diu, merged into 26 in 2020) and 28
 * (undivided Andhra Pradesh) are retired and left out. Union territories with a legislature (Delhi, Puducherry,
 * Jammu and Kashmir) charge SGST like states; the others charge UTGST.
 */
export const gstStates = [
  { code: "01", name: "Jammu and Kashmir", kind: "union-territory-with-legislature" },
  { code: "02", name: "Himachal Pradesh", kind: "state" },
  { code: "03", name: "Punjab", kind: "state" },
  { code: "04", name: "Chandigarh", kind: "union-territory" },
  { code: "05", name: "Uttarakhand", kind: "state" },
  { code: "06", name: "Haryana", kind: "state" },
  { code: "07", name: "Delhi", kind: "union-territory-with-legislature" },
  { code: "08", name: "Rajasthan", kind: "state" },
  { code: "09", name: "Uttar Pradesh", kind: "state" },
  { code: "10", name: "Bihar", kind: "state" },
  { code: "11", name: "Sikkim", kind: "state" },
  { code: "12", name: "Arunachal Pradesh", kind: "state" },
  { code: "13", name: "Nagaland", kind: "state" },
  { code: "14", name: "Manipur", kind: "state" },
  { code: "15", name: "Mizoram", kind: "state" },
  { code: "16", name: "Tripura", kind: "state" },
  { code: "17", name: "Meghalaya", kind: "state" },
  { code: "18", name: "Assam", kind: "state" },
  { code: "19", name: "West Bengal", kind: "state" },
  { code: "20", name: "Jharkhand", kind: "state" },
  { code: "21", name: "Odisha", kind: "state" },
  { code: "22", name: "Chhattisgarh", kind: "state" },
  { code: "23", name: "Madhya Pradesh", kind: "state" },
  { code: "24", name: "Gujarat", kind: "state" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu", kind: "union-territory" },
  { code: "27", name: "Maharashtra", kind: "state" },
  { code: "29", name: "Karnataka", kind: "state" },
  { code: "30", name: "Goa", kind: "state" },
  { code: "31", name: "Lakshadweep", kind: "union-territory" },
  { code: "32", name: "Kerala", kind: "state" },
  { code: "33", name: "Tamil Nadu", kind: "state" },
  { code: "34", name: "Puducherry", kind: "union-territory-with-legislature" },
  { code: "35", name: "Andaman and Nicobar Islands", kind: "union-territory" },
  { code: "36", name: "Telangana", kind: "state" },
  { code: "37", name: "Andhra Pradesh", kind: "state" },
  { code: "38", name: "Ladakh", kind: "union-territory" },
  // Offshore areas beyond any state; the UTGST Act counts them as a union territory.
  { code: "97", name: "Other Territory", kind: "union-territory" },
] as const;

export type GstStateCode = (typeof gstStates)[number]["code"];

const stateCodes: ReadonlySet<string> = new Set(gstStates.map((state) => state.code));
const utgstCodes: ReadonlySet<string> = new Set(
  gstStates.filter((state) => state.kind === "union-territory").map((state) => state.code),
);

export function isGstStateCode(code: string): code is GstStateCode {
  return stateCodes.has(code);
}

/** True where intra-state supplies carry UTGST instead of SGST. */
export function isUnionTerritoryWithoutLegislature(code: GstStateCode): boolean {
  return utgstCodes.has(code);
}

/** A state picked from the list, e.g. "27" for Maharashtra. */
export const gstStateCode = z.enum(gstStates.map((state) => state.code) as [GstStateCode, ...GstStateCode[]]);

const CHECK_CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** State code, PAN (5 letters, 4 digits, a letter), entity number, "Z", check character. */
const GSTIN_PATTERN = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * The GSTIN's 15th character for its first 14: a Luhn checksum in base 36, weighting every second character twice
 * from the left. It catches every single wrong character and most swaps.
 */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const product = CHECK_CHARACTERS.indexOf(first14.charAt(index)) * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHECK_CHARACTERS.charAt((36 - (sum % 36)) % 36);
}

/** True for a well-formed GSTIN in capitals, of a state that exists, whose check character matches. */
export function isValidGstin(text: string): boolean {
  const match = GSTIN_PATTERN.exec(text);
  return !!match?.[1] && isGstStateCode(match[1]) && gstinCheckCharacter(text.slice(0, 14)) === text.charAt(14);
}

/** The state a GSTIN is registered in. Throws RangeError for an invalid GSTIN. */
export function gstStateCodeFromGstin(gstinText: string): GstStateCode {
  const code = gstinText.slice(0, 2);
  if (!isValidGstin(gstinText) || !isGstStateCode(code)) throw new RangeError("Not a valid GSTIN");
  return code;
}

/** A GSTIN typed in any case, stored in capitals. */
export const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidGstin, "Check the GSTIN: 15 characters, ending in a check character that must match");
