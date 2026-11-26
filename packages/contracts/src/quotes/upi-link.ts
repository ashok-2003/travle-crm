// The link that opens a customer's UPI app to pay an agency (NPCI's upi://pay): one builder for the page's button, its QR,
// the PDF's QR and the settings preview, so they can never disagree.
import type { QuoteSettings } from "./quotes.js";

/**
 * The agency's UPI id and name, and when `payment` is given the amount and a note. Null without a UPI id, or when the
 * amount asked is nothing.
 */
export function upiPayLink(
  settings: Pick<QuoteSettings, "upiId" | "upiName">,
  payment?: { amountPaise: number; note: string },
): string | null {
  if (settings.upiId === "" || (payment !== undefined && payment.amountPaise <= 0)) return null;
  const params = new URLSearchParams({
    pa: settings.upiId,
    pn: settings.upiName === "" ? settings.upiId : settings.upiName,
    ...(payment === undefined
      ? {}
      : {
          am: `${String(Math.floor(payment.amountPaise / 100))}.${String(payment.amountPaise % 100).padStart(2, "0")}`,
        }),
    cu: "INR",
    ...(payment === undefined ? {} : { tn: payment.note.slice(0, 50) }),
  });
  return `upi://pay?${params.toString()}`;
}
