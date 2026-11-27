// A search for a phone (R5): four or more digits as typed, and no letters. Shared by every list that searches phones.

/**
 * The digits a phone search looks for, without a leading trunk "0" or international "00" (stored numbers are E.164);
 * all zeros stay as typed. Null for a search that isn't a phone's.
 */
export function phoneSearchDigits(text: string): string | null {
  const typed = text.replace(/\D/g, "");
  if (typed.length < 4 || /\p{L}/u.test(text)) return null;
  const digits = typed.replace(/^0+/, "");
  return digits === "" ? typed : digits;
}
