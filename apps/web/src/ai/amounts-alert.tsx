"use client";

// A note under a free-text editor of the AI (Instructions, Strict rules) when it holds a price or a date: they belong in the
// packages, so the AI won't send them from here. It only informs; nothing is blocked.
import { amountsAndDatesIn } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AmountsAlert({ text }: { text: string }) {
  const t = useTranslations("ai");
  if (amountsAndDatesIn(text).length === 0) return null;
  return (
    <Alert>
      <AlertDescription>{t("amountsAndDates")}</AlertDescription>
    </Alert>
  );
}
