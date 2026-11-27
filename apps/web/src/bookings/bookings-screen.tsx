"use client";

// /bookings (release 6; the table, bookings revamp 2026-11-27): the member's bookings (or the agency's), by travel date
// soonest first and trips without a date last, in numbered pages of 25 (50 or 100). At the top right the search (a
// customer's name, a phone's digits, a trip or a booking number) and Filters (travel dates, salesperson for a member who
// sees everyone's, payment); the status chips stay over the rows, one tap to a status or to the payments to check, and
// what Filters applied shows as chips that let it go. The chips, filters, sort and page live in the address, the search in
// the tab; any change but the page starts at page 1, and a page past the last moves to the last. A polite status says how
// many bookings are shown, so screen readers hear each answer.
import { BOOKING_TABLE_PAGE_SIZES, bookingTablePageInput } from "@travel-crm/contracts/bookings";
import { BriefcaseBusinessIcon, SearchXIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AppliedFilters } from "@/components/data-table/applied-filters";
import { DataTable } from "@/components/data-table/data-table";
import { TableToolbar } from "@/components/data-table/table-toolbar";
import { useTableSearch } from "@/components/data-table/use-table-search";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { pageRange } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCount } from "@/lib/format";
import { bookingRoute } from "@/lib/routes";
import { useMe, viewScope } from "@/session/me-context";
import { BookingsFilters, useAppliedChips, type BookingFilters } from "./bookings-filters";
import { useBookingColumns, useStackedBooking } from "./bookings-table";
import {
  bookingChips,
  bookingsHref,
  bookingsStart,
  isFiltered,
  readBookingsAddress,
  tableInputOf,
  type BookingsAddress,
} from "./list-address";
import { useBookingSalespeople, useBookingTablePage } from "./use-bookings";

const searchText = bookingTablePageInput.shape.search.unwrap();

export function BookingsScreen() {
  const t = useTranslations("bookings.list");
  const ownOnly = viewScope(useMe(), "bookings:view") !== "all";
  const router = useRouter();
  const address = readBookingsAddress(useSearchParams(), ownOnly);
  const [search, setSearch] = useTableSearch("bookings.search", searchText);
  const list = useBookingTablePage(tableInputOf(address, search));
  const salespeople = useBookingSalespeople(!ownOnly);
  const columns = useBookingColumns(!ownOnly);
  const stacked = useStackedBooking(!ownOnly);
  // Clear filters empties the search box too, by giving it a fresh start.
  const [searchBox, setSearchBox] = useState(0);
  const filtersButton = useRef<HTMLButtonElement>(null);

  const total = list.data?.total ?? 0;
  const range = pageRange(address.page, address.limit, total);
  const settled = list.data !== undefined && !list.isPlaceholderData;
  // A page past the last (a kept link; its bookings gone) moves to the last.
  const pastTheEnd = settled && total > 0 && address.page > range.pages;
  const lastPage = bookingsHref({ ...address, page: range.pages });
  useEffect(() => {
    if (pastTheEnd) router.replace(lastPage);
  }, [pastTheEnd, lastPage, router]);

  /** Another list: its first page, at the same size. */
  const show = (next: BookingsAddress) => {
    router.replace(bookingsHref({ ...next, page: 1 }));
  };
  /** Another page or size of this list, a step in the history so Back and Forward walk them. */
  const go = (page: number, limit: number = address.limit) => {
    const size = BOOKING_TABLE_PAGE_SIZES.find((one) => one === limit) ?? address.limit;
    router.push(bookingsHref({ ...address, page, limit: size }));
  };
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
    <div className="flex flex-col gap-3">
      <TableToolbar
        key={searchBox}
        search={search}
        onSearch={(text) => {
          setSearch(text);
          if (address.page !== 1) show(address);
        }}
        searchLabel={t("search")}
        searchPlaceholder={t("searchPlaceholder")}
        filters={
          <BookingsFilters
            filters={filters}
            chosen={chips.length}
            salespeople={ownOnly ? null : salespeople}
            opener={filtersButton}
            onApply={applyFilters}
          />
        }
      />
      {/* The chips scroll sideways in their own strip on a phone and wrap on a wider screen; the padding keeps their focus
          outline in view. */}
      <ToggleGroup
        type="single"
        variant="outline"
        value={address.chip}
        onValueChange={(value) => {
          const chip = bookingChips.find((one) => one === value);
          if (chip !== undefined) show({ ...address, chip });
        }}
        aria-label={t("filterLabel")}
        className="-m-1 max-w-full justify-start overflow-x-auto p-1 md:flex-wrap md:overflow-visible"
      >
        {bookingChips.map((chip) => (
          <ToggleGroupItem key={chip} value={chip} className="min-h-11 shrink-0 px-4">
            {t(`filters.${chip}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <AppliedFilters chips={chips} />
      {/* Always there, so a change in it is heard; the list itself says it to the eye. */}
      <p role="status" className="sr-only">
        {shown}
      </p>
    </div>
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
      <PageHeader title={t("title")} intro={t("intro")} />
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
        sizes={BOOKING_TABLE_PAGE_SIZES}
        noun={t("pageNoun", { count: total })}
        onPage={go}
        onLimit={(size) => {
          // The page that holds the first booking shown, at the new size.
          go(Math.floor(Math.max(range.from - 1, 0) / size) + 1, size);
        }}
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
