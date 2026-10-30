"use client";

// A departure's state in words and a dot (DESIGN.md section 6): Open, Filling fast, Full, Closed by staff, Cancelled. Worked
// out from the seats by the api; the screens only say it.
import type { SeatState } from "@travel-crm/contracts/departures";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

const tones: Record<SeatState, StatusTone> = {
  open: "good",
  filling: "attention",
  full: "neutral",
  closed: "neutral",
  cancelled: "bad",
};

export function DepartureStateBadge({ state }: { state: SeatState }) {
  const t = useTranslations("departures.states");
  return <StatusBadge tone={tones[state]}>{t(state)}</StatusBadge>;
}
