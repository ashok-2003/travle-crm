// Finds payment details in a text: a UPI handle, an account number, an IFSC code, a payment link. A reply's check
// refuses them (only code sends payment details), and the agency's words lose them before a model reads them.

export interface PaymentDetail {
  start: number;
  end: number;
}

/** handle@bank, never an email address: one whose host goes on with a dot and more letters ("asha@gmail.com"). */
const UPI_HANDLE = /(?<![\w.@-])[\w.-]{2,}@[a-z][a-z0-9]+(?![\w@-]|\.[a-z])/giu;
/** 9 to 18 digits in one run, the length of an Indian bank account number. */
const DIGIT_RUN = /(?<![\d+])\d{9,18}(?!\d)/gu;
/** The same written in groups split by a space or a hyphen, as accounts often are: "5010 0234 5678 90". */
const DIGIT_GROUPS = /(?<![\d+-])\d{2,}(?:[ -]\d+)+(?![\d-])/gu;
/** A mobile number (with 0 or 91 before it) is a phone, unless an account word stands just before it. */
const MOBILE = /^(?:0|91)?[6-9]\d{9}$/u;
const ACCOUNT_WORD = /\b(?:a\/?c|account|acct|acc|khata)\b/iu;
const IFSC = /\b[a-z]{4}0[a-z0-9]{6}\b/giu;
/** upi:// links, web links, and the payment hosts written without http. */
const LINK =
  /\bupi:\/\/\S+|(?:https?:\/\/|\bwww\.)\S+|\b(?:[\w-]+\.)*(?:rzp\.io|razorpay\.[a-z]{2,}|paytm\.[a-z]{2,}|phonepe\.[a-z]{2,}|gpay\.[a-z]{2,}|pay\.[\w-]+\.[a-z]{2,})(?:\/\S*)?/giu;
const PAYMENT_HOST = /^upi:|razorpay|rzp\.io|paytm|phonepe|gpay|(?:\/\/|^|www\.|\.)pay\./iu;
const TRAILING = /[.,;:!?)\]]+$/u;

const spansOf = (text: string, pattern: RegExp): PaymentDetail[] =>
  [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length }));

/**
 * Account numbers: a run of 9 to 18 digits; or digit groups holding 11 digits or more in all, or 9 right after an account
 * word ("A/c 5010 0234 5678 90"). A mobile number stays a phone ("+91 98765 43210") unless an account word names it.
 */
function accountNumbers(text: string): PaymentDetail[] {
  const afterAccountWord = (start: number) => ACCOUNT_WORD.test(text.slice(0, start).split(/\s+/).slice(-4).join(" "));
  const runs = spansOf(text, DIGIT_RUN).filter(
    ({ start, end }) => !MOBILE.test(text.slice(start, end)) || afterAccountWord(start),
  );
  const groups = spansOf(text, DIGIT_GROUPS).filter(({ start, end }) => {
    const digits = text.slice(start, end).replace(/\D/gu, "");
    if (MOBILE.test(digits) && !afterAccountWord(start)) return false;
    return digits.length >= 11 || (digits.length >= 9 && afterAccountWord(start));
  });
  return [...runs, ...groups];
}

function paymentLinks(text: string): PaymentDetail[] {
  return [...text.matchAll(LINK)].flatMap((m) => {
    const link = m[0].replace(TRAILING, "");
    return PAYMENT_HOST.test(link) ? [{ start: m.index, end: m.index + link.length }] : [];
  });
}

/** Every payment detail in the text, in order, overlapping ones merged. */
export function paymentDetailsIn(text: string): PaymentDetail[] {
  const found = [...spansOf(text, UPI_HANDLE), ...accountNumbers(text), ...spansOf(text, IFSC), ...paymentLinks(text)];
  const merged: PaymentDetail[] = [];
  for (const span of found.sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = merged.at(-1);
    if (last && span.start < last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** The text with every payment detail taken out and the gaps closed: what the agency typed, without a stale account. */
export function withoutPaymentDetails(text: string): string {
  let result = text;
  for (const { start, end } of paymentDetailsIn(text).reverse()) result = result.slice(0, start) + result.slice(end);
  return result
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?)])/g, "$1")
    .replace(/\( +/g, "(")
    .trim();
}
