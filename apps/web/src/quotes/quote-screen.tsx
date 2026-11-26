"use client";

// /quotes/<id> (step 3, P0): one quote. Its status and its actions in one row (quote-actions.tsx), then its money beside
// the form that writes it. A quote out of the member's scope is "not found", as a lead is.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { InfoIcon, SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink, TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { refusalOf } from "@/data/api-error";
import { leadRoute, quoteRoute, routes } from "@/lib/routes";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { QuoteActions } from "./quote-actions";
import { QuoteDepartureCard } from "@/departures/quote-departure-card";
import { BookingCostsCard } from "@/finance/booking-costs-card";
import { MarginFigures, MarginNotice } from "./margin-notice";
import { QuoteForm } from "./quote-form";
import { QuoteMoney } from "./quote-money";
import { QuoteStatusBadge } from "./quote-status";
import { useQuote, useQuoteChanges } from "./use-quotes";

/** Why a quote that is no longer a draft can't be written, and the way on: a new version, or the one that replaced it. */
function FrozenNotice({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("quotes.quote");
  const { timeZone } = useMe().organization;
  if (quote.status === "draft") return null;
  const replaced = quote.status === "replaced";
  // An accepted quote is one sentence: who accepted it, when, and that it is now the booking.
  if (quote.status === "accepted") {
    const when = quote.acceptedAt === null ? null : formatDay(new Date(quote.acceptedAt), { timeZone });
    return (
      <Alert>
        <InfoIcon aria-hidden="true" />
        <AlertDescription>
          {t(quote.acceptedName === null ? "acceptedSentence" : "acceptedByOn", {
            name: quote.acceptedName ?? "",
            when: when ?? "",
          })}
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <InfoIcon aria-hidden="true" />
      <AlertTitle>{replaced ? t("replacedTitle") : t("frozenTitle")}</AlertTitle>
      <AlertDescription>
        {replaced ? t("replacedBody") : t("frozenBody")}
        {quote.replacedById !== null && (
          <>
            {" "}
            <TextLink href={quoteRoute(quote.replacedById)} inline>
              {t("openReplacement")}
            </TextLink>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function QuoteScreen({ quoteId }: { quoteId: string }) {
  const t = useTranslations("quotes.quote");
  const quote = useQuote(quoteId);
  const { update } = useQuoteChanges();
  const body = (): ReactNode => {
    if (quote.data) {
      const data = quote.data;
      return (
        <>
          <BackLink href={leadRoute(data.leadId)} label={t("backToLead", { name: data.customerName })} />
          <PageHeader title={data.title} intro={<QuoteStatusBadge status={data.status} />} />
          <QuoteActions quote={data} />
          <FrozenNotice quote={data} />
          <MarginNotice quote={data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
            <QuoteForm
              key={data.updatedAt}
              quote={data}
              sending={update}
              onSave={(input) => {
                update.mutate(input, { onSuccess: () => toast.success(t("saved")) });
              }}
            />
            <div className="flex flex-col gap-6 xl:sticky xl:top-6">
              <QuoteMoney quote={data} />
              <MarginFigures quote={data} />
              <QuoteDepartureCard quote={data} />
              <BookingCostsCard quoteId={data.id} />
            </div>
          </div>
        </>
      );
    }
    if (refusalOf(quote.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    }
    if (quote.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={quote.error}
          retryLabel={t("retry")}
          onRetry={() => void quote.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("loading")} />;
  };
  return (
    <div className="flex flex-col gap-6">
      {quote.data === undefined && <BackLink href={routes.quotes} label={t("backToQuotes")} />}
      {body()}
    </div>
  );
}
