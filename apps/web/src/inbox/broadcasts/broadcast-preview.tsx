"use client";

// Who a broadcast would reach before it is confirmed (sales inbox spec 6): how many get it, how many are left out and why,
// the month's allowance, and how many go today and how many wait for the next morning. Counts only: no rupee.
import type { BroadcastPreview } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";

export function BroadcastPreviewCard({ preview }: { preview: BroadcastPreview }) {
  const t = useTranslations("inbox.broadcasts.dialog");
  const left = (["optedOut", "noConsent", "outsideVisibility", "overAllowance"] as const).filter(
    (reason) => preview.leftOut[reason] > 0,
  );
  return (
    <section aria-label={t("check")} className="mt-4 flex flex-col gap-3">
      <p className="text-label font-medium" aria-live="polite">
        {t("reaches", { count: preview.willSend })}
      </p>
      {left.length > 0 && (
        <Details rows={left.map((reason) => ({ label: t(reason, { count: preview.leftOut[reason] }) }))} />
      )}
      <p className="text-muted-foreground">
        {preview.allowance === null ? t("noAllowance") : t("allowance", preview.allowance)}
      </p>
      {preview.willSend > 0 && <p className="text-muted-foreground">{t("today", preview.today)}</p>}
    </section>
  );
}
