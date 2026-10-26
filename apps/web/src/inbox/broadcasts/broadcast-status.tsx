"use client";

// A broadcast's status as a badge (always a dot and a word), and the sentence for why it paused.
import type { BroadcastSummary } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const tones: Record<BroadcastSummary["status"], StatusTone> = {
  sending: "good",
  paused: "attention",
  cancelled: "neutral",
  done: "neutral",
};

export function BroadcastStatus({ status }: { status: BroadcastSummary["status"] }) {
  const t = useTranslations("inbox.broadcasts.status");
  return <StatusBadge tone={tones[status]}>{t(status)}</StatusBadge>;
}
