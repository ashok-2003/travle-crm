// A file's size as people read it, in Indian English: "512 bytes", "860 KB", "1.2 MB". 1,024 bytes to the step, as
// file managers count; whole bytes and KB, one decimal from MB up. Bytes are spelt out by Intl; KB, MB and GB are
// symbols, as ₹ is (Intl's own "kB" isn't what Indian file managers show).
import { formatIndianNumber } from "@travel-crm/domain/kernel";

const SYMBOLS = ["KB", "MB", "GB"] as const;
const STEP = 1024;

const bytesFormat = new Intl.NumberFormat("en-IN", { style: "unit", unit: "byte", unitDisplay: "long" });
const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function formatFileSize(bytes: number): string {
  if (bytes < STEP) return bytesFormat.format(bytes);
  let size = bytes / STEP;
  let step = 0;
  while (size >= STEP && step < SYMBOLS.length - 1) {
    size /= STEP;
    step += 1;
  }
  const shown = step === 0 ? formatIndianNumber(Math.round(size)) : oneDecimal.format(size);
  return `${shown} ${SYMBOLS[step] ?? "GB"}`;
}
