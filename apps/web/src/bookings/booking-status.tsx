"use client";

// A booking's status as a badge (release 6): requested waits for the agency, confirmed is on, completed is over, cancelled is off.
import type { BookingStatus } from "@travel-crm/contracts/bookings";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const tones: Record<BookingStatus, StatusTone> = {
  requested: "attention",
  confirmed: "good",
  completed: "neutral",
  cancelled: "bad",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations("bookings.status");
  return <StatusBadge tone={tones[status]}>{t(status)}</StatusBadge>;
}
