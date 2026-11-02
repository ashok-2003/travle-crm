"use client";

// An AI feature's name on the console ("Autopilot" for autopilot); a feature the words don't know yet shows as it is
// stored, so a new one never breaks the screen.
import { useTranslations } from "next-intl";

const named = [
  "suggest_reply",
  "score_lead",
  "autopilot",
  "learn",
  "fill_form",
  "write_up",
  "ask_report",
  "read_requests",
  "reach_out",
] as const;
type Named = (typeof named)[number];

const isNamed = (feature: string): feature is Named => (named as readonly string[]).includes(feature);

export function useFeatureName(): (feature: string) => string {
  const t = useTranslations("consoleAi.features");
  return (feature) => (isNamed(feature) ? t(feature) : feature);
}
