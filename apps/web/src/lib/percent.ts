// A share typed as a percentage ("5", "-2.5", "12.55") and its basis points (500, -250, 1255), both ways. Whole basis points
// only, so a rate is never a float in the api: two decimals at most.

/** A percentage as basis points: "5" is 500, "-2.5" is -250; null for anything else. */
export function basisPointsOf(text: string): number | null {
  const match = /^(-?)(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (match === null) return null;
  const hundredths = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] === "-" ? -hundredths : hundredths;
}

/** Basis points as the percentage a person types: 500 is "5", 1250 is "12.5". */
export function percentText(basisPoints: number): string {
  const sign = basisPoints < 0 ? "-" : "";
  const hundredths = Math.abs(basisPoints);
  const whole = Math.floor(hundredths / 100);
  const rest = String(hundredths % 100)
    .padStart(2, "0")
    .replace(/0$/, "");
  return `${sign}${String(whole)}${rest === "" || rest === "0" ? "" : `.${rest}`}`;
}
