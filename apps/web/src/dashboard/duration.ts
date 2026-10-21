// A wait in minutes as the dashboard says it: "12 min", "1 h 20 min", "3 days".
type Words = (key: "minutes" | "hours" | "days", values: Record<string, number>) => string;

const MINUTES_PER_DAY = 24 * 60;

export function waitWords(minutes: number, t: Words): string {
  const whole = Math.round(minutes);
  if (whole < 60) return t("minutes", { minutes: whole });
  if (whole < MINUTES_PER_DAY) return t("hours", { hours: Math.floor(whole / 60), minutes: whole % 60 });
  return t("days", { days: Math.round(whole / MINUTES_PER_DAY) });
}
