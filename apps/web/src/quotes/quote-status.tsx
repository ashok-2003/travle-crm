"use client";

// A quote's status as a badge (step 3, P0): a draft is not yet sent, sent waits for the customer, accepted is a sale.
import type { QuoteStatus } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const tones: Record<QuoteStatus, StatusTone> = {
  draft: "neutral",
  sent: "attention",
  accepted: "good",
  declined: "bad",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const t = useTranslations("quotes.status");
  return <StatusBadge tone={tones[status]}>{t(status)}</StatusBadge>;
}
