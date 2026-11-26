"use client";

// What a package row says, shared by the table and the phone's rows: its kind in words, its From price, its next
// departure with the seats left, and the badges for what needs attention (a trip that is fine has none).
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { rupees } from "@/components/forms/money-field";
import { StatusBadge } from "@/components/status-badge";
import { formatCalendarDay } from "@/lib/format";
import { mayBeMissing } from "@/lib/older-api";

/** Seats free at or under which a departure is "filling": its count is bold. */
const FEW_SEATS = 5;

/** The trip's kind: "Group trip · 2 nights", or a custom trip's nights, days or tiers. */
export function useKindWords() {
  const t = useTranslations("packages.list");
  return (one: QuotePackage) => {
    const nights = one.nights ?? 0;
    if (one.kind === "group") return t("kindGroup", { nights });
    if (one.tierCount > 0) return t("summaryTiers", { days: one.days, tiers: one.tierCount });
    if (one.subtotalPaise > 0) return t("summary", { days: one.days, price: rupees(one.subtotalPaise) });
    return t("summaryCustom", { nights });
  };
}

/** A departure's seats: "20 left", the count in bold when few, or "Full". */
function Seats({ free }: { free: number }) {
  const t = useTranslations("packages.list");
  if (free === 0) return <>{t("full")}</>;
  const words = t("seatsLeft", { free });
  return free <= FEW_SEATS ? <strong>{words}</strong> : <>{words}</>;
}

/** "27 Nov · 20 left" (the caller gives it the number font), or nothing for a trip with no departure ahead (and for an older api that does not say). */
export function NextDeparture({ one }: { one: QuotePackage }) {
  const next = mayBeMissing(one.nextDeparture);
  if (next === null || next === undefined) return null;
  return (
    <>
      {formatCalendarDay(next.startDate)} · <Seats free={next.seatsFree} />
    </>
  );
}

/** The phone's line: "From ₹5,000 · 27 Nov · 20 left"; an older api's answer gets the departures count instead. */
export function PhoneLine({ one }: { one: QuotePackage }) {
  const t = useTranslations("packages.list");
  const kind = useKindWords();
  if (one.kind !== "group") return <span className="numbers">{kind(one)}</span>;
  const next = mayBeMissing(one.nextDeparture);
  const parts: ReactNode[] = [];
  if (one.fromPricePaise !== null) parts.push(t("fromPrice", { price: rupees(one.fromPricePaise) }));
  if (next === undefined) parts.push(t("departuresAhead", { count: one.departuresAhead }));
  else if (next !== null) parts.push(<NextDeparture key="next" one={one} />);
  if (parts.length === 0) return <span>{kind(one)}</span>;
  return (
    <span className="numbers">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && " · "}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

/** The badges a trip needs: the AI cannot sell it (its first reason), the AI is off, or a group trip has no departure. */
export function PackageBadges({ one }: { one: QuotePackage }) {
  const t = useTranslations("packages.list");
  const tReasons = useTranslations("packages.sell.reasons");
  return (
    <>
      {one.aiGap !== null ? (
        <StatusBadge tone="neutral">{t("aiBlocked", { reason: tReasons(one.aiGap) })}</StatusBadge>
      ) : (
        !one.aiSellable && <StatusBadge tone="neutral">{t("aiOff")}</StatusBadge>
      )}
      {one.kind === "group" && one.departuresAhead === 0 && (
        <StatusBadge tone="attention">{t("noDeparturesAhead")}</StatusBadge>
      )}
    </>
  );
}
