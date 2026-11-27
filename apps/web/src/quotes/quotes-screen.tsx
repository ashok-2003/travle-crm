"use client";

// /quotes (step 3, P0; the table, bookings revamp 2026-11-27): the member's quotes (or the agency's), last changed first,
// in numbered pages of 25 (50 or 100), each with its customer, trip, travel date, status (a draft behind an unpaid AI
// booking says it waits for payment, or that its hold expired), total, last change and salesperson. At the top right the
// search (a customer's name, a phone's digits or a trip) and Filters (travel dates, and the salesperson for a member who
// sees everyone's), beside the status chips (one status, or the accepted quotes with money still to come); what Filters
// applied shows as chips that let it go. The chips, filters, sort and page live in the address, the search in the tab;
// any change but the page starts at page 1, and a page past the last moves to the last. New quote asks for the lead.
import { TABLE_PAGE_SIZES } from "@travel-crm/contracts/kernel";
import { quoteTablePageInput } from "@travel-crm/contracts/quotes";
import { FileTextIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { TableChips } from "@/components/data-table/table-chips";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { TripFiltersDialog, useTripChips, type TripFilters } from "@/components/data-table/trip-filters";
import { useTablePlace } from "@/components/data-table/use-table-place";
import { useTableSearch } from "@/components/data-table/use-table-search";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { quoteRoute } from "@/lib/routes";
import { useHolds, useMe, viewScope } from "@/session/me-context";
import { isFiltered, quoteChips, quoteInputOf, quotesHref, quotesStart, readQuotesAddress } from "./list-address";
import { NewQuoteDialog } from "./new-quote-dialog";
import { useQuoteColumns, useStackedQuote } from "./quotes-table";
import { useQuoteSalespeople, useQuoteTablePage } from "./use-quotes";

const searchText = quoteTablePageInput.shape.search.unwrap();

export function QuotesScreen() {
  const t = useTranslations("quotes.list");
  const ownOnly = viewScope(useMe(), "quotes:view") !== "all";
  const address = readQuotesAddress(useSearchParams(), ownOnly);
  const [search, setSearch] = useTableSearch("quotes.search", searchText);
  const list = useQuoteTablePage(quoteInputOf(address, search));
  const salespeople = useQuoteSalespeople(!ownOnly);
  const columns = useQuoteColumns(!ownOnly);
  const stacked = useStackedQuote(!ownOnly);
  const mayCreate = useHolds("quotes:create");
  const newButton = useRef<HTMLButtonElement>(null);
  const [choosing, setChoosing] = useState(false);
  // Clear filters empties the search box too, by giving it a fresh start.
  const [searchBox, setSearchBox] = useState(0);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const total = list.data?.total ?? 0;
  const settled = list.data !== undefined && !list.isPlaceholderData;
  const { range, show, go, resize } = useTablePlace(address, quotesHref, TABLE_PAGE_SIZES, { total, settled });

  const filters: TripFilters = {
    travelFrom: address.travelFrom,
    travelTo: address.travelTo,
    ownerUserId: address.ownerUserId,
  };
  const applyFilters = ({ travelFrom, travelTo, ownerUserId }: TripFilters) => {
    show({ ...address, travelFrom, travelTo, ownerUserId });
  };
  // A chip let go gives the focus to Filters, where it was chosen.
  const chips = useTripChips(filters, salespeople.data, (next) => {
    applyFilters(next);
    filtersButton.current?.focus();
  });
  const clear = () => {
    show(quotesStart);
    setSearch("");
    setSearchBox((box) => box + 1);
  };
  const filtered = isFiltered(address, search);
  const shown = !settled
    ? null
    : total > 0
      ? t("found", { from: formatCount(range.from), to: formatCount(range.to), total })
      : filtered
        ? t("emptyFiltered")
        : null;

  const toolbar = (
    <TableToolbar
      key={searchBox}
      search={search}
      onSearch={(text) => {
        setSearch(text);
        if (address.page !== 1) show(address);
      }}
      searchLabel={t("search")}
      searchPlaceholder={t("searchPlaceholder")}
      chips={
        <TableChips
          chips={quoteChips}
          value={address.chip}
          label={t("filterLabel")}
          wordOf={(chip) => t(`filters.${chip}`)}
          onChoose={(chip) => {
            show({ ...address, chip });
          }}
        />
      }
      filters={
        <TripFiltersDialog
          filters={filters}
          chosen={chips.length}
          salespeople={ownOnly ? null : salespeople}
          opener={filtersButton}
          words={{
            button: t("filtersButton"),
            chosen: t("filtersChosen", { count: chips.length }),
            title: t("filtersDialog.title"),
            description: t("filtersDialog.description"),
            clear: t("filtersDialog.clear"),
            apply: t("filtersDialog.apply"),
          }}
          onApply={applyFilters}
        />
      }
      applied={chips}
      status={shown}
    />
  );

  const empty = filtered ? (
    <EmptyState
      icon={SearchXIcon}
      message={t("emptyFiltered")}
      action={
        <Button variant="outline" onClick={clear}>
          {t("clearFilters")}
        </Button>
      }
    />
  ) : (
    <EmptyState icon={FileTextIcon} message={t("empty")} />
  );

  return (
    <div className="flex flex-col gap-6">
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
      <DataTable
        label={t("quotes")}
        columns={columns}
        rows={list.data?.items}
        rowKey={(quote) => quote.id}
        rowHref={(quote) => quoteRoute(quote.id)}
        stacked={stacked}
        total={total}
        page={address.page}
        limit={address.limit}
        sizes={TABLE_PAGE_SIZES}
        noun={t("pageNoun", { count: total })}
        onPage={go}
        onLimit={resize}
        sort={{ key: address.sort, direction: address.direction }}
        onSort={(sort) => {
          show({ ...address, sort: sort.key, direction: sort.direction });
        }}
        busy={list.isPlaceholderData}
        // A failure of the page asked for; a failed refetch of the page in view keeps its rows.
        error={list.data === undefined || list.isPlaceholderData ? list.error : null}
        onRetry={() => void list.refetch()}
        loadFailed={t("loadFailed")}
        loadingLabel={t("loading")}
        toolbar={toolbar}
        empty={empty}
      />
    </div>
  );
}
