"use client";

// A quote's status as a badge (step 3, P0): a draft is not yet sent, sent waits for the customer, accepted is a sale. A
// draft behind an AI booking nobody has paid reads "Waiting for payment", or "Hold expired" once its seats lapsed.
import type { QuotePaymentWait, QuoteStatus } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const tones: Record<QuoteStatus, StatusTone> = {
  draft: "neutral",
  sent: "attention",
  accepted: "good",
  declined: "bad",
  replaced: "neutral",
};

export function QuoteStatusBadge({
  status,
  paymentWait,
}: {
  status: QuoteStatus;
  /** What an older api leaves out: the badge then reads the status alone. */
  paymentWait?: QuotePaymentWait | null | undefined;
}) {
  const t = useTranslations("quotes.status");
  const waiting = status === "draft" ? paymentWait : null;
  if (waiting != null) return <StatusBadge tone="attention">{t(waiting)}</StatusBadge>;
  return <StatusBadge tone={tones[status]}>{t(status)}</StatusBadge>;
}
