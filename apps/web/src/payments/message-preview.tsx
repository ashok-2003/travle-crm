"use client";

// What the customer will hear from a decision, before the person makes it: the agency's words as they will go, or that its
// WhatsApp template or a task for a person tells them instead. The api works it out with the builder that then sends it.
import type { PaymentPreviewInput } from "@travel-crm/contracts/bookings";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/data/trpc";

export function MessagePreview({ input }: { input: PaymentPreviewInput }) {
  const t = useTranslations("payments.preview");
  const trpc = useTRPC();
  const preview = useQuery(trpc.paymentsToCheck.preview.queryOptions(input)).data;
  if (preview === undefined) return null;
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <p className="text-caption text-muted-foreground">{t("label")}</p>
      <p className="whitespace-pre-wrap">{preview.way === "message" ? preview.text : t(preview.way)}</p>
    </div>
  );
}
