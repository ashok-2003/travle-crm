"use client";

// The hot leads to call now (sales execution), on Home: the five hottest first, each with why (opened the quote, asked
// to book, travels soon, a big budget), a call button and its page; View all opens Leads. Shown to whoever sees leads;
// nothing when none is hot.
import type { HotLead } from "@travel-crm/contracts/sales";
import { PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { HomeCard } from "@/home/home-card";
import { formatCalendarDay } from "@/lib/format";
import { leadRoute, routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useHotLeads } from "./use-sales";

function HotRow({ lead }: { lead: HotLead }) {
  const t = useTranslations("sales.hot");
  return (
    <Item size="sm" role="listitem">
      <ItemContent>
        <ItemTitle>
          <TextLink inline href={leadRoute(lead.leadId)}>
            {lead.name}
          </TextLink>
        </ItemTitle>
        <ItemDescription>
          {[lead.destination, lead.startDate === null ? null : formatCalendarDay(lead.startDate)]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        </ItemDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {lead.reasons.map((reason) => (
            <StatusBadge key={reason} tone="bad">
              {t(`reasons.${reason}`)}
            </StatusBadge>
          ))}
        </div>
      </ItemContent>
      {lead.phone !== null && (
        <ItemActions>
          <Button asChild variant="outline" aria-label={t("callNamed", { name: lead.name })}>
            <a href={`tel:${lead.phone}`}>
              <PhoneIcon aria-hidden="true" />
              {t("call")}
            </a>
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}

/** Home shows five at most. */
const SHOWN = 5;

export function HotLeadsCard() {
  const t = useTranslations("sales.hot");
  const th = useTranslations("home.hot");
  const sees = useHolds("leads:view");
  const hot = useHotLeads();
  if (!sees) return null;
  if (hot.isError) {
    return <LoadFailedAlert message={t("loadFailed")} error={hot.error} onRetry={() => void hot.refetch()} />;
  }
  if (hot.data === undefined || hot.data.length === 0) return null;
  return (
    <HomeCard title={th("title")} viewAll={routes.leads}>
      <ItemGroup>
        {hot.data.slice(0, SHOWN).map((lead) => (
          <HotRow key={lead.leadId} lead={lead} />
        ))}
      </ItemGroup>
    </HomeCard>
  );
}
