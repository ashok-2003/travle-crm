"use client";

// A lead's quotes on its page (step 3, P0): each with its status, total and what is left to pay, opening its own page;
// New quote starts one from what the lead already says (where, when, who) and opens it to write the plan and price.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { LeadCard } from "@/leads/lead/lead-card";
import { quoteRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { QuoteStatusBadge } from "./quote-status";
import { useLeadQuotes, useQuoteChanges, useQuoteSettings } from "./use-quotes";

export function LeadQuotesCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("quotes.lead");
  const router = useRouter();
  const mayCreate = useHolds("quotes:create");
  const access = useWriteAccess("change");
  const quotes = useLeadQuotes(lead.id);
  const settings = useQuoteSettings();
  const { create } = useQuoteChanges();
  const { trip } = lead;
  const start = () => {
    create.mutate(
      {
        leadId: lead.id,
        title: trip.destination === null ? t("defaultTitle") : t("titleFor", { place: trip.destination.name }),
        startDate: trip.when.kind === "dates" ? trip.when.from : null,
        adults: trip.adults ?? 2,
        children: trip.childrenAges.length,
        days: [],
        items: [],
        inclusions: "",
        exclusions: "",
        notes: "",
        taxRateBasisPoints: settings.data?.defaultTaxRateBasisPoints ?? 500,
        placeOfSupply: null,
      },
      {
        onSuccess: (quote) => {
          router.push(quoteRoute(quote.id));
        },
      },
    );
  };
  const body = () => {
    if (quotes.data === undefined) {
      return quotes.isError ? (
        <LoadFailedAlert message={t("loadFailed")} error={quotes.error} onRetry={() => void quotes.refetch()} />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    if (quotes.data.length === 0) return <p className="text-muted-foreground">{t("none")}</p>;
    return (
      <ItemGroup>
        {quotes.data.map((quote) => (
          <Item key={quote.id} size="sm">
            <ItemContent>
              <ItemTitle>
                <TextLink inline href={quoteRoute(quote.id)}>
                  {quote.title}
                </TextLink>
              </ItemTitle>
              <ItemDescription className="numbers">
                {t("money", { total: rupees(quote.totals.totalPaise), balance: rupees(quote.totals.balancePaise) })}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <QuoteStatusBadge status={quote.status} />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    );
  };
  return (
    <LeadCard
      title={t("title")}
      action={
        mayCreate && (
          <Button variant="outline" disabled={create.isPending || !access.allowed} onClick={start}>
            {create.isPending ? <Spinner aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
            {t("new")}
          </Button>
        )
      }
    >
      <RefusalAlert error={create.error} />
      {body()}
    </LeadCard>
  );
}
