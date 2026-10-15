"use client";

// An organization's subscription status in the console (DESIGN.md: a dot and a word, never colour alone): green while
// it is paid for, amber once a payment is due, red from read-only on, neutral for a trial or no subscription at all.
import type { SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const toneOf: Record<SubscriptionStatus, StatusTone> = {
  trial: "neutral",
  active: "good",
  past_due: "attention",
  read_only: "bad",
  suspended: "bad",
  cancelled: "bad",
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus | null }) {
  const t = useTranslations("console.status");
  return status === null ? (
    <StatusBadge tone="neutral">{t("none")}</StatusBadge>
  ) : (
    <StatusBadge tone={toneOf[status]}>{t(status)}</StatusBadge>
  );
}
