"use client";

// /quotes (step 3, P0): the member's quotes (or the agency's), recently changed first, each with its customer, status,
// total and what is still to be paid; chips narrow it to one status or to the quotes with money still to come.
import type { ListQuotesInput, QuoteSummary } from "@travel-crm/contracts/quotes";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { TextLink } from "@/components/text-link";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/leads/list/search-field";
import { mayBeMissing } from "@/lib/older-api";
import { useHolds } from "@/session/me-context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCalendarDay } from "@/lib/format";
import { quoteRoute } from "@/lib/routes";
import { NewQuoteDialog } from "./new-quote-dialog";
import { QuoteStatusBadge } from "./quote-status";
import { useQuotes } from "./use-quotes";
import { useQuotesSearch } from "./use-quotes-search";

const filters = ["all", "draft", "sent", "accepted", "due"] as const;
type Filter = (typeof filters)[number];

const inputOf = (filter: Filter, search: string): ListQuotesInput => ({
  ...(filter === "due" ? { balanceDue: true } : filter === "all" ? {} : { status: filter }),
  ...(search !== "" && { search }),
});

function QuoteRow({ quote }: { quote: QuoteSummary }) {
  return (
    <TableRow>
      <TableCell>
        <TextLink inline href={quoteRoute(quote.id)}>
          {quote.title}
        </TextLink>
        <p className="text-caption text-muted-foreground">
          {quote.customerName}
          {quote.startDate === null ? "" : ` · ${formatCalendarDay(quote.startDate)}`}
        </p>
      </TableCell>
      <TableCell>
        <QuoteStatusBadge status={quote.status} paymentWait={mayBeMissing(quote.paymentWait)} />
      </TableCell>
      <TableCell className="numbers text-right">{rupees(quote.totals.totalPaise)}</TableCell>
      <TableCell className="numbers text-right">{rupees(quote.totals.balancePaise)}</TableCell>
    </TableRow>
  );
}

export function QuotesScreen() {
  const t = useTranslations("quotes.list");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useQuotesSearch();
  const mayCreate = useHolds("quotes:create");
  const newButton = useRef<HTMLButtonElement>(null);
  const [choosing, setChoosing] = useState(false);
  const list = useQuotes(inputOf(filter, search));
  const body = () => {
    if (list.data === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={t("retry")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="table" columns={4} label={t("loading")} />
      );
    }
    if (list.data.length === 0)
      return (
        <EmptyState
          icon={FileTextIcon}
          message={t(search !== "" ? "noMatch" : filter === "all" ? "empty" : "noneHere")}
        />
      );
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.quote")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead className="text-right">{t("columns.total")}</TableHead>
            <TableHead className="text-right">{t("columns.balance")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data.map((quote) => (
            <QuoteRow key={quote.id} quote={quote} />
          ))}
        </TableBody>
      </Table>
    );
  };
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        action={
          mayCreate && (
            <>
              <Button
                ref={newButton}
                onClick={() => {
                  setChoosing(true);
                }}
              >
                <PlusIcon aria-hidden="true" />
                {t("new")}
              </Button>
              <NewQuoteDialog open={choosing} onOpenChange={setChoosing} returnFocusTo={newButton} />
            </>
          )
        }
      />
      <SearchField
        initial={search}
        onSearch={setSearch}
        label={t("search")}
        placeholder={t("searchPlaceholder")}
        className="md:w-96"
      />
      <ToggleGroup
        type="single"
        variant="outline"
        value={filter}
        onValueChange={(value) => {
          if (value !== "") setFilter(value as Filter);
        }}
        aria-label={t("filterLabel")}
        className="flex-wrap"
      >
        {filters.map((one) => (
          <ToggleGroupItem key={one} value={one} className="min-h-11 px-4">
            {t(`filters.${one}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {body()}
    </div>
  );
}
