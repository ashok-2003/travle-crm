"use client";

// /bookings (release 6; the table, bookings revamp 2026-11-27): the member's bookings (or the agency's), by travel date
// soonest first and trips without a date last, in numbered pages of 25 (50 or 100). At the top right the search (a
// customer's name, a phone's digits, a trip or a booking number) and Filters (travel dates, salesperson for a member who
// sees everyone's, payment); the status chips stay beside them, one tap to a status or to the payments to check, and
// what Filters applied shows as chips that let it go. The chips, filters, sort and page live in the address, the search in
// the tab; any change but the page starts at page 1, and a page past the last moves to the last. A polite status says how
// many bookings are shown, so screen readers hear each answer.
import { bookingTablePageInput } from "@travel-crm/contracts/bookings";
import { TABLE_PAGE_SIZES } from "@travel-crm/contracts/kernel";
import { BriefcaseBusinessIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { DataTable } from "@/components/data-table/data-table";
import { TableChips } from "@/components/data-table/table-chips";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { useTablePlace } from "@/components/data-table/use-table-place";
import { useTableSearch } from "@/components/data-table/use-table-search";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { bookingRoute } from "@/lib/routes";
import { useHolds, useMe, viewScope } from "@/session/me-context";
import { NewBookingDialog } from "./new-booking-dialog";
import { BookingsFilters, useAppliedChips, type BookingFilters } from "./bookings-filters";
import { useBookingColumns, useStackedBooking } from "./bookings-table";
import { BookingExportButton } from "./export/booking-export-button";
import {
  bookingChips,
  bookingFilterOf,
  bookingsHref,
  bookingsStart,
  isFiltered,
  readBookingsAddress,
  tableInputOf,
} from "./list-address";
import { useBookingSalespeople, useBookingTablePage } from "./use-bookings";

const searchText = bookingTablePageInput.shape.search.unwrap();

export function BookingsScreen() {
  const t = useTranslations("bookings.list");
  const ownOnly = viewScope(useMe(), "bookings:view") !== "all";
  const address = readBookingsAddress(useSearchParams(), ownOnly);
  const [search, setSearch] = useTableSearch("bookings.search", searchText);
  const list = useBookingTablePage(tableInputOf(address, search));
  const salespeople = useBookingSalespeople(!ownOnly);
  const columns = useBookingColumns(!ownOnly);
  const stacked = useStackedBooking(!ownOnly);
  // Clear filters empties the search box too, by giving it a fresh start.
  const [searchBox, setSearchBox] = useState(0);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const [choosing, setChoosing] = useState(false);
  // A booking makes its quote too: both permissions, as the api asks.
  const mayEdit = useHolds("bookings:edit");
  const mayQuote = useHolds("quotes:edit");
  const mayCreate = mayEdit && mayQuote;
  const total = list.data?.total ?? 0;
  const settled = list.data !== undefined && !list.isPlaceholderData;
  const { range, show, go, resize } = useTablePlace(address, bookingsHref, TABLE_PAGE_SIZES, { total, settled });

  const filters: BookingFilters = {
    travelFrom: address.travelFrom,
    travelTo: address.travelTo,
    ownerUserId: address.ownerUserId,
    payment: address.payment,
  };
  const applyFilters = (next: BookingFilters) => {
    show({ ...address, ...next });
  };
  // A chip let go gives the focus to Filters, where it was chosen.
  const chips = useAppliedChips(filters, salespeople.data, (next) => {
    applyFilters(next);
    filtersButton.current?.focus();
  });
  const clear = () => {
    show(bookingsStart);
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
          chips={bookingChips}
          value={address.chip}
          label={t("filterLabel")}
          wordOf={(chip) => t(`filters.${chip}`)}
          onChoose={(chip) => {
            show({ ...address, chip });
          }}
        />
      }
      filters={
        <BookingsFilters
          filters={filters}
          chosen={chips.length}
          salespeople={ownOnly ? null : salespeople}
          opener={filtersButton}
          onApply={applyFilters}
        />
      }
      exportButton={
        <BookingExportButton
          filter={bookingFilterOf(address, search)}
          salespersonName={salespeople.data?.find((person) => person.userId === address.ownerUserId)?.name ?? null}
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
    <EmptyState icon={BriefcaseBusinessIcon} message={t("empty")} />
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
              <NewBookingDialog open={choosing} onOpenChange={setChoosing} returnFocusTo={newButton} />
            </>
          )
        }
      />
      <DataTable
        label={t("bookings")}
        columns={columns}
        rows={list.data?.items}
        rowKey={(booking) => booking.id}
        rowHref={(booking) => bookingRoute(booking.id)}
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
