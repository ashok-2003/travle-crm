"use client";

// A lead's quotes on its page (step 3, P0): each with its status, total and what is left to pay, opening its own page;
// New quote starts one blank from what the lead already says (where, when, who), or from one of the agency's ready
// packages in a tap (sales execution, fast quoting), and opens it.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { TextLink } from "@/components/text-link";
import { rupees } from "@/components/forms/money-field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { LeadCard } from "@/leads/lead/lead-card";
import { mayBeMissing } from "@/lib/older-api";
import { quoteRoute } from "@/lib/routes";
import { NewQuoteMenu } from "./new-quote-menu";
import { QuoteStatusBadge } from "./quote-status";
import { useLeadQuotes } from "./use-quotes";

export function LeadQuotesCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("quotes.lead");
  const quotes = useLeadQuotes(lead.id);
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
              <QuoteStatusBadge status={quote.status} paymentWait={mayBeMissing(quote.paymentWait)} />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    );
  };
  return (
    <LeadCard title={t("title")} action={<NewQuoteMenu lead={lead} />}>
      {body()}
    </LeadCard>
  );
}
