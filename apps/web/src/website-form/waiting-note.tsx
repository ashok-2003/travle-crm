"use client";

// What the visitor sees while the form loads: a spinner, and once the api seems to be waking, a sentence that says so, so
// a cold start never reads as a failure (W42).
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";

export function WaitingNote({ waking }: { waking: boolean }) {
  const t = useTranslations("websiteForm.page");
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-12 text-center">
      <Spinner className="size-8 text-muted-foreground" aria-label={t("loading")} />
      {waking && <p className="text-muted-foreground">{t("waking")}</p>}
    </div>
  );
}
