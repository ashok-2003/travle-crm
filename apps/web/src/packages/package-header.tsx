"use client";

// A trip's page header (/packages/<id>): its name and a status line that says at a glance whether the AI sells it,
// whether its page is live, its From price and, for a group trip, its next departure and how many dates are ahead (as
// the Packages list counts them). A part still loading is left out until it is there.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { rupees } from "@/components/forms/money-field";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useDepartureList } from "@/departures/use-departures";
import { formatCalendarDay } from "@/lib/format";
import { useQuotePackages } from "@/quotes/use-quotes";
import { dayKeyOf } from "./price-calendar-days";

export function PackageHeader({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.header");
  const group = detail.kind === "group";
  const upcoming = useDepartureList("upcoming", group, detail.id);
  const listed = useQuotePackages().data?.find((one) => one.id === detail.id);
  const today = dayKeyOf(new Date());
  // The list also holds a departure already under way; the next is the first still to start.
  const next = upcoming.data?.find((departure) => departure.startDate >= today);
  const aiSells = detail.sellable && detail.sellGaps.length === 0;
  // A published page is live only while the agency's public pages are on.
  const pageLive = detail.published && detail.pagesEnabled;
  const facts = [
    detail.fromPricePaise === null ? null : t("fromPrice", { price: rupees(detail.fromPricePaise) }),
    group && next !== undefined ? t("nextDeparture", { day: formatCalendarDay(next.startDate) }) : null,
    group && listed !== undefined ? t("datesAhead", { count: listed.departuresAhead }) : null,
  ].filter((fact) => fact !== null);
  return (
    <PageHeader
      title={detail.name}
      intro={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge tone={aiSells ? "good" : "neutral"}>{t(aiSells ? "aiSells" : "aiDoesNotSell")}</StatusBadge>
          <StatusBadge tone={pageLive ? "good" : "neutral"}>{t(pageLive ? "pageLive" : "pageNotLive")}</StatusBadge>
          {facts.length > 0 && <span>{facts.join(" · ")}</span>}
        </span>
      }
    />
  );
}
