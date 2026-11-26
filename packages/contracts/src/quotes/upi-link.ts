// The link that opens a customer's UPI app to pay an agency (NPCI's upi://pay): one builder for the page's button, its QR,
// the PDF's QR and the settings preview, so they can never disagree.
import type { QuoteSettings } from "./quotes.js";

/** The longest link the PDF's contract keeps (its `link` line). */
export const MAX_UPI_LINK_LENGTH = 400;

/** Percent-encoded as NPCI's links are: a space is %20, never "+", and nothing but letters, digits and "-._~" stays bare. */
const encode = (text: string) =>
  encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const firstCharacters = (text: string, count: number) => Array.from(text).slice(0, count).join("");

/**
 * The agency's UPI id and name, and when `payment` is given the amount and a note. Null without a UPI id, or when the
 * amount asked is nothing. The name and note are cut by whole characters (no split emoji) and again, if need be, until
 * the link fits `MAX_UPI_LINK_LENGTH`: the UPI id is never cut.
 */
export function upiPayLink(
  settings: Pick<QuoteSettings, "upiId" | "upiName">,
  payment?: { amountPaise: number; note: string },
): string | null {
  if (settings.upiId === "" || (payment !== undefined && payment.amountPaise <= 0)) return null;
  const name = settings.upiName === "" ? settings.upiId : settings.upiName;
  const amount =
    payment === undefined
      ? ""
      : `${String(Math.floor(payment.amountPaise / 100))}.${String(payment.amountPaise % 100).padStart(2, "0")}`;
  const build = (nameLength: number, noteLength: number) =>
    `upi://pay?${[
      `pa=${encode(settings.upiId)}`,
      `pn=${encode(firstCharacters(name, nameLength))}`,
      ...(payment === undefined ? [] : [`am=${amount}`]),
      "cu=INR",
      ...(payment === undefined ? [] : [`tn=${encode(firstCharacters(payment.note, noteLength))}`]),
    ].join("&")}`;
  let nameLength = 50;
  let noteLength = 50;
  let link = build(nameLength, noteLength);
  while (link.length > MAX_UPI_LINK_LENGTH && (noteLength > 0 || nameLength > 1)) {
    if (noteLength > 0) noteLength -= 1;
    else nameLength -= 1;
    link = build(nameLength, noteLength);
  }
  return link;
}
