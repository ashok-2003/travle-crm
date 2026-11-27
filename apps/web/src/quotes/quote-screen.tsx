"use client";

// /quotes/<id> (step 3, P0): one quote. Its status and its actions in one row (quote-actions.tsx), then its money beside
// the form that writes it. A quote out of the member's scope is "not found", as a lead is. A quote that is out (sent,
// accepted), and an AI booking's draft the customer already agreed to in chat, opens read; Edit opens a draft's form.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { BackLink, TextLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { leadRoute, quoteRoute, routes } from "@/lib/routes";
import { mayBeMissing } from "@/lib/older-api";
import { formatCalendarDay, formatDay, formatWeekday } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { QuoteActions } from "./quote-actions";
import { QuoteDepartureCard } from "@/departures/quote-departure-card";
import { BookingCostsCard } from "@/finance/booking-costs-card";
import { MarginFigures, MarginNotice } from "./margin-notice";
import { FrozenQuote } from "./frozen-quote";
import { QuoteForm } from "./quote-form";
import { QuoteMoney } from "./quote-money";
import { QuoteStatusBadge } from "./quote-status";
import { useQuote, useQuoteChanges } from "./use-quotes";

/** Why a quote that is no longer a draft can't be written, and the way on: small, at the very bottom of the page. */
function FrozenNotice({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("quotes.quote");
  const { timeZone } = useMe().organization;
  if (quote.status === "draft") return null;
  const replaced = quote.status === "replaced";
  // An accepted quote is one sentence: who accepted it, when, and that it is now the booking.
  if (quote.status === "accepted") {
    const when = quote.acceptedAt === null ? null : formatDay(new Date(quote.acceptedAt), { timeZone });
    return (
      <p className="text-caption text-muted-foreground">
        {t(quote.acceptedName === null ? "acceptedSentence" : "acceptedByOn", {
          name: quote.acceptedName ?? "",
          when: when ?? "",
        })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-caption text-muted-foreground">
      <p className="font-medium">{replaced ? t("replacedTitle") : t("frozenTitle")}</p>
      <p>
        {replaced ? t("replacedBody") : t("frozenBody")}
        {quote.replacedById !== null && (
          <>
            {" "}
            <TextLink href={quoteRoute(quote.replacedById)} inline>
              {t("openReplacement")}
            </TextLink>
          </>
        )}
      </p>
    </div>
  );
}

/** The trip's date with its weekday and its people, in ink: "Fri 4 Dec · 1 adult, 2 children". */
function TripLine({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("quotes.frozen");
  const parts = [
    quote.startDate === null
      ? null
      : `${formatWeekday(new Date(`${quote.startDate}T00:00:00Z`), { timeZone: "UTC" })} ${formatCalendarDay(quote.startDate)}`,
    [t("adults", { count: quote.adults }), quote.children > 0 ? t("children", { count: quote.children }) : null]
      .filter((part): part is string => part !== null)
      .join(", "),
  ];
  return <p className="text-section font-medium">{parts.filter((part) => part !== null).join(" · ")}</p>;
}

export function QuoteScreen({ quoteId }: { quoteId: string }) {
  const t = useTranslations("quotes.quote");
  const quote = useQuote(quoteId);
  const { update } = useQuoteChanges();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (editing) document.getElementById("quote-form")?.scrollIntoView({ block: "start" });
  }, [editing]);
  const body = (): ReactNode => {
    if (quote.data) {
      const data = quote.data;
      const paymentWait = mayBeMissing(data.paymentWait);
      // An AI booking's draft waits on the customer's money, not on a person: it reads as a sent quote until Edit.
      const awaitsPayment = data.status === "draft" && paymentWait != null;
      const reading = data.status !== "draft" || (awaitsPayment && !editing);
      return (
        <>
          <BackLink href={leadRoute(data.leadId)} label={t("backToLead", { name: data.customerName })} />
          <PageHeader title={data.title} intro={<QuoteStatusBadge status={data.status} paymentWait={paymentWait} />} />
          <QuoteActions
            quote={data}
            onEdit={
              awaitsPayment && !editing
                ? () => {
                    setEditing(true);
                  }
                : undefined
            }
          />
          {reading && <TripLine quote={data} />}
          <MarginNotice quote={data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
            {reading ? (
              <FrozenQuote quote={data} />
            ) : (
              <QuoteForm
                key={data.updatedAt}
                quote={data}
                sending={update}
                onSave={(input) => {
                  update.mutate(input, { onSuccess: () => toast.success(t("saved")) });
                }}
              />
            )}
            <div className="flex flex-col gap-6 max-xl:contents xl:sticky xl:top-6">
              <QuoteMoney quote={data} reading={reading} />
              <MarginFigures quote={data} />
              <QuoteDepartureCard quote={data} />
              <BookingCostsCard quoteId={data.id} />
            </div>
          </div>
          <FrozenNotice quote={data} />
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
