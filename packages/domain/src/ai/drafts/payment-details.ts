// How to pay, found by its shape and removed from the agency's documents before anything reads them: a draft never carries
// payment details. Structure, not a list of banks: a UPI id is `name@handle` whose handle has no dot after it (so every
// payment app's handle goes, and an email such as sales@icici.com stays), an account number follows "a/c" or "account" or
// shares a line with an IFSC code, and a pay link is a known payment link.
export const REMOVED = "[payment details removed]";

const UPI_ID = /[\w.+-]+@[A-Za-z][A-Za-z0-9-]*(?![A-Za-z0-9-])(?!\.[A-Za-z0-9])/g;
const IFSC = /\b[A-Za-z]{4}0[A-Za-z0-9]{6}\b/g;
/** 9 to 18 digits, with a space or hyphen allowed between any two. */
const DIGIT_RUN = String.raw`\d(?:[ \t-]?\d){8,17}`;
const ACCOUNT = new RegExp(
  String.raw`\b((?:a\/c|ac|acc|acct|account)\b\.?[ \t]*(?:(?:no|num)\b\.?|number\b|#)?[ \t]*[:-]?[ \t]*)${DIGIT_RUN}(?!\d)`,
  "gi",
);
const LONG_NUMBER = new RegExp(`${DIGIT_RUN}(?!\\d)`, "g");
const PAY_LINK =
  /upi:\/\/\S+|https?:\/\/(?:[\w-]+\.)*(?:rzp\.io|razorpay\.me|paytm\.me|phon\.pe|phonepe\.com|pay\.google\.com|gpay\.app\.goo\.gl)\S*/gi;

function redactLine(line: string): string {
  const hasIfsc = new RegExp(IFSC).test(line);
  const withoutLinks = line.replace(PAY_LINK, REMOVED).replace(UPI_ID, REMOVED);
  const withoutCodes = withoutLinks.replace(IFSC, REMOVED).replace(ACCOUNT, `$1${REMOVED}`);
  return hasIfsc ? withoutCodes.replace(LONG_NUMBER, REMOVED) : withoutCodes;
}

/** A text with each payment identifier replaced, line by line; the rest of the text (emails, "bank", phone numbers) stays. */
export const redactPayment = (text: string): string => text.split("\n").map(redactLine).join("\n");
