// The cells every export writes alike (B38, D28): an instant as the agency's wall clock reads it, and paise as rupees.

const clocks = new Map<string, Intl.DateTimeFormat>();

/**
 * An instant as the agency's wall clock reads: "2026-10-19T23:50". One cached formatter and one string per call: the
 * kernel's calendarDateIn and timeOfDayIn take apart every instant they format, which for 100,000 cells (two to a
 * lead) costs seconds and hundreds of MB of the worker's memory.
 */
export function wallClockOf(instant: Date, timeZone: string): string {
  let clock = clocks.get(timeZone);
  if (clock === undefined) {
    // Sweden's order is year-month-day, hours 00-23: "2026-10-19 23:50".
    clock = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    clocks.set(timeZone, clock);
  }
  return clock.format(instant).replace(/\s+/, "T");
}

/**
 * Paise as rupees, whole rupees plus the paise's hundredths, from the bigint: the cell is a number (B38) so a sheet can
 * add and sort it, which a text cell would stop.
 */
export const rupeesOf = (paise: bigint | number): number => {
  const whole = BigInt(paise);
  return Number(whole / 100n) + Number(whole % 100n) / 100;
};
