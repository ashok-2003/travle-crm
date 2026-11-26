"use client";

// A trip's page header (/packages/<id>): its name and a status line that says at a glance whether the AI sells it (and,
// with its switch on, the first thing it still needs, linking to the switch), whether its page is live, its From price
// and, for a group trip, its next departure and how many departures are ahead (as the Packages list counts them). A
// part still loading is left out until it is there. While the page is live, Copy link and Open the page sit beside the
// title.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import { rupees } from "@/components/forms/money-field";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { useDepartureList } from "@/departures/use-departures";
import { formatCalendarDay } from "@/lib/format";
import { useQuotePackages } from "@/quotes/use-quotes";
import { pageAddress } from "./page-address";
import { sellAnchor } from "./sell-card";
import { useAgencyToday } from "./use-agency-today";

export function PackageHeader({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.header");
  const tReasons = useTranslations("packages.sell.reasons");
  const group = detail.kind === "group";
  const upcoming = useDepartureList("upcoming", group, detail.id);
  const listed = useQuotePackages().data?.find((one) => one.id === detail.id);
  const today = useAgencyToday();
  // The list also holds a departure already under way; the next is the first still to start.
  const next = upcoming.data?.find((departure) => departure.startDate >= today);
  const firstGap = detail.sellGaps[0];
  const aiSells = detail.sellable && firstGap === undefined;
  // A published page is live only while the agency's public pages are on.
  const pageLive = detail.published && detail.pagesEnabled;
  const address = pageAddress(detail);
  const facts = [
    detail.fromPricePaise === null ? null : t("fromPrice", { price: rupees(detail.fromPricePaise) }),
    group && next !== undefined ? t("nextDeparture", { day: formatCalendarDay(next.startDate) }) : null,
    group && listed !== undefined ? t("departuresAhead", { count: listed.departuresAhead }) : null,
  ].filter((fact) => fact !== null);
  return (
    <PageHeader
      title={detail.name}
      action={
        pageLive && address !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton value={address.full} label={t("copyLink")} />
            <TextLink href={address.path} newTab>
              {t("openPage")}
            </TextLink>
          </div>
        ) : undefined
      }
      intro={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge tone={aiSells ? "good" : "neutral"}>
            {aiSells ? (
              t("aiSells")
            ) : detail.sellable && firstGap !== undefined ? (
              <TextLink inline href={`#${sellAnchor}`}>
                {t("aiDoesNotSellBecause", { reason: tReasons(firstGap) })}
              </TextLink>
            ) : (
              t("aiDoesNotSell")
            )}
          </StatusBadge>
          <StatusBadge tone={pageLive ? "good" : "neutral"}>{t(pageLive ? "pageLive" : "pageNotLive")}</StatusBadge>
          {facts.length > 0 && <span>{facts.join(" · ")}</span>}
        </span>
      }
    />
  );
}
