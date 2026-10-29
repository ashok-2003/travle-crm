"use client";

// The hot leads to call now (sales execution), on Home and Today: hottest first, each with why (opened the quote, asked
// to book, travels soon, a big budget), a call button and its page. Shown to whoever sees leads; nothing when none is hot.
import type { HotLead } from "@travel-crm/contracts/sales";
import { FlameIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay } from "@/lib/format";
import { leadRoute } from "@/lib/routes";
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

export function HotLeadsCard() {
  const t = useTranslations("sales.hot");
  const sees = useHolds("leads:view");
  const hot = useHotLeads();
  if (!sees) return null;
  if (hot.isError) {
    return <LoadFailedAlert message={t("loadFailed")} error={hot.error} onRetry={() => void hot.refetch()} />;
  }
  if (hot.data === undefined || hot.data.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlameIcon aria-hidden="true" className="size-5 text-status-bad-ink" />
          <h2>{t("title", { count: hot.data.length })}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {hot.data.slice(0, 8).map((lead) => (
            <HotRow key={lead.leadId} lead={lead} />
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
