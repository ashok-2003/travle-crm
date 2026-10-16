// A file's size as people read it, in Indian English: "512 bytes", "860 KB", "1.2 MB". 1,024 bytes to the step, as
// file managers count; whole bytes and KB, one decimal from MB up. Bytes are spelt out by Intl; KB, MB and GB are
// symbols, as ₹ is (Intl's own "kB" isn't what Indian file managers show).
import { formatIndianNumber } from "@travel-crm/domain/kernel";

const SYMBOLS = ["KB", "MB", "GB"] as const;
const STEP = 1024;

const bytesFormat = new Intl.NumberFormat("en-IN", { style: "unit", unit: "byte", unitDisplay: "long" });
const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** The size as shown at a step: whole KB, one decimal from MB up. */
const shownAt = (size: number, step: number) => (step === 0 ? Math.round(size) : Math.round(size * 10) / 10);

export function formatFileSize(bytes: number): string {
  if (bytes < STEP) return bytesFormat.format(bytes);
  let size = bytes / STEP;
  let step = 0;
  // Rounded before the check, so 1,023.6 KB shows as 1 MB rather than "1,024 KB".
  while (shownAt(size, step) >= STEP && step < SYMBOLS.length - 1) {
    size /= STEP;
    step += 1;
  }
  const shown = shownAt(size, step);
  return `${step === 0 ? formatIndianNumber(shown) : oneDecimal.format(shown)} ${SYMBOLS[step] ?? "GB"}`;
}
