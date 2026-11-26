// An amount in words the Indian way, as an invoice prints it: "Rupees One Lakh Twenty Thousand and Fifty Paise Only".
const ones = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"] as const;

/** 1 to 99. */
function belowHundred(value: number): string {
  if (value < 20) return ones[value] ?? "";
  const unit = value % 10;
  return `${tens[Math.floor(value / 10)] ?? ""}${unit === 0 ? "" : ` ${ones[unit] ?? ""}`}`;
}

/** 1 to 999. */
function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return [hundreds > 0 ? `${ones[hundreds] ?? ""} Hundred` : "", rest > 0 ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** Whole rupees in Indian places: crore, lakh, thousand, then the last three digits. */
function wholeNumberInWords(value: number): string {
  if (value === 0) return ones[0];
  const places: [number, string][] = [
    [10_000_000, "Crore"],
    [100_000, "Lakh"],
    [1000, "Thousand"],
  ];
  let rest = value;
  const words: string[] = [];
  for (const [size, name] of places) {
    const count = Math.floor(rest / size);
    if (count > 0) words.push(`${wholeNumberInWords(count)} ${name}`);
    rest %= size;
  }
  if (rest > 0) words.push(belowThousand(rest));
  return words.join(" ");
}

/** "Rupees Ten Only", "Rupees Ten and Fifty Paise Only", "Fifty Paise Only" for under a rupee. */
export function rupeesInWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0)
    throw new RangeError(`An amount in paise is a whole number, got ${String(paise)}`);
  const rupees = Math.floor(paise / 100);
  const remainder = paise % 100;
  const rupeeWords = rupees > 0 || remainder === 0 ? `Rupees ${wholeNumberInWords(rupees)}` : "";
  const paiseWords = remainder > 0 ? `${belowHundred(remainder)} Paise` : "";
  return `${[rupeeWords, paiseWords].filter(Boolean).join(" and ")} Only`;
}
