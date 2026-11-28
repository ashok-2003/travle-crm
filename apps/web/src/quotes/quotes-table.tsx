"use client";

// What the Quotes list shows of each quote (bookings revamp, 2026-11-27). On a computer the table's columns: the
// customer (a link to the quote), the trip, the travel date, the status ("Waiting for payment" or "Hold expired" for a
// draft behind an unpaid AI booking), the total (with what is still to pay on an accepted quote), the last change (in the
// agency's time zone) and the salesperson, for a member who sees everyone's. On a phone each quote stacks the same: the
// customer and status, the trip and its date, the money, then the last change and the salesperson.
import type { QuoteTableRow, QuoteTableSort } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import type { DataColumn } from "@/components/data-table/data-table";
import { rupees } from "@/components/forms/money-field";
import { TextLink } from "@/components/text-link";
import { ItemContent, ItemDescription, ItemHeader, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay, formatDay } from "@/lib/format";
import { quoteRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { QuoteStatusBadge } from "./quote-status";

const caption = "text-caption text-muted-foreground";
/** A number in the numbers font, the words around it in the text's own. */
const numbers = (chunks: ReactNode) => <span className="numbers">{chunks}</span>;

/** The total, and under it what is still to pay on an accepted quote. */
function MoneyCell({ quote, end = false }: { quote: QuoteTableRow; end?: boolean }) {
  const t = useTranslations("quotes.list");
  const { totalPaise, balancePaise } = quote.totals;
  return (
    <div className={cn("flex flex-col gap-0.5", end ? "items-end" : "items-start")}>
      <span className="numbers">{rupees(totalPaise)}</span>
      {quote.status === "accepted" && balancePaise > 0 && (
        <span className={caption}>{t.rich("toPay", { amount: rupees(balancePaise), n: numbers })}</span>
      )}
    </div>
  );
}

function useWords() {
  const t = useTranslations("quotes.list");
  const { timeZone } = useMe().organization;
  return {
    t,
    travelDate: (quote: QuoteTableRow) => (quote.startDate === null ? t("noDate") : formatCalendarDay(quote.startDate)),
    changed: (quote: QuoteTableRow) => formatDay(new Date(quote.updatedAt), { timeZone }),
    salesperson: (quote: QuoteTableRow) => quote.ownerName ?? t("noSalesperson"),
  };
}

const status = (quote: QuoteTableRow) => <QuoteStatusBadge status={quote.status} paymentWait={quote.paymentWait} />;

/** The table's columns; the salesperson only for a member who sees everyone's quotes. */
export function useQuoteColumns(showSalesperson: boolean): DataColumn<QuoteTableRow, QuoteTableSort>[] {
  const { t, travelDate, changed, salesperson } = useWords();
  const header = (column: "customer" | "trip" | "travel" | "status" | "total" | "changed" | "salesperson") =>
    t(`columns.${column}`);
  const columns: DataColumn<QuoteTableRow, QuoteTableSort>[] = [
    {
      key: "customer",
      header: header("customer"),
      sort: "customer",
      cell: (quote) => (
        <span className="lg:[&>a]:min-h-0">
          <TextLink href={quoteRoute(quote.id)}>
            <span className="script-leading">{quote.customerName}</span>
          </TextLink>
        </span>
      ),
    },
    { key: "trip", header: header("trip"), cell: (quote) => <span className="script-leading">{quote.title}</span> },
    {
      key: "travel",
      header: header("travel"),
      sort: "travel",
      width: 128,
      cell: (quote) => <span className={quote.startDate === null ? caption : "numbers"}>{travelDate(quote)}</span>,
    },
    { key: "status", header: header("status"), width: 192, cell: status },
    {
      key: "total",
      header: header("total"),
      sort: "total",
      width: 144,
      end: true,
      cell: (quote) => <MoneyCell quote={quote} end />,
    },
    {
      key: "changed",
      header: header("changed"),
      sort: "updated",
      sortFirst: "desc",
      width: 136,
      end: true,
      cell: (quote) => <span className="numbers">{changed(quote)}</span>,
    },
  ];
  return showSalesperson
    ? [...columns, { key: "salesperson", header: header("salesperson"), width: 144, cell: salesperson }]
    : columns;
}

/** A quote on a phone: the customer and status, the trip and its date, the money, then the rest in a line. */
export function useStackedQuote(showSalesperson: boolean): (quote: QuoteTableRow) => ReactNode {
  const { t, travelDate, changed, salesperson } = useWords();
  return (quote) => {
    const rest: ReactNode[] = [
      t("changedOn", { day: changed(quote) }),
      ...(showSalesperson ? [salesperson(quote)] : []),
    ];
    return (
      <>
        <ItemHeader className="items-start">
          <ItemTitle className="min-w-0">
            <span className="script-leading wrap-anywhere">{quote.customerName}</span>
          </ItemTitle>
          {status(quote)}
        </ItemHeader>
        <ItemContent className="gap-1">
          <ItemDescription className="script-leading">
            {t("tripOn", { trip: quote.title, day: travelDate(quote) })}
          </ItemDescription>
          <MoneyCell quote={quote} />
          <span className={caption}>
            {rest.map((part, index) => (
              <Fragment key={index}>
                {index > 0 && " · "}
                {part}
              </Fragment>
            ))}
          </span>
        </ItemContent>
      </>
    );
  };
}
