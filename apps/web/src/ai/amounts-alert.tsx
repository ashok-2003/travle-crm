"use client";

// A note under a free-text editor of the AI (Instructions, Strict rules) when it holds a price or a date, for an agency that
// answers from its packages (the switch as saved): prices and dates belong in the packages, so the AI won't send them from
// here. The old agent still reads them there, so its agencies see nothing. It only informs; nothing is blocked.
import { amountsAndDatesIn } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAutopilot } from "./use-ai";

export function AmountsAlert({ text }: { text: string }) {
  const t = useTranslations("ai");
  const grounded = useAutopilot().data?.grounded === true;
  if (!grounded || amountsAndDatesIn(text).length === 0) return null;
  return (
    <Alert>
      <AlertDescription>{t("amountsAndDates")}</AlertDescription>
    </Alert>
  );
}
