"use client";

// A table's toolbar (bookings revamp, 2026-11-27): the search box, Export and Filters at the top right of the table, and
// the list's quick chips (TableChips), from a computer's width (1024px) at the left of the same line, wrapping there when
// there are many; below it the chips have a line of their own under the search. On a phone the search takes what the
// buttons leave on its line, or the line to itself when that would be too narrow (the buttons then sit under it at the
// right). Under it all, what Filters applied as chips that let each filter go (AppliedFilters), and a polite status, always
// there so screen readers hear each answer ("Showing 1 to 25 of 132 bookings"). The search is the shared box
// (search-field.tsx: sent once typing pauses, in the list's own words); the list remounts the toolbar with a new key to
// empty it.
import type { ReactNode } from "react";
import { AppliedFilters, type AppliedFilter } from "@/components/data-table/applied-filters";
import { SearchField } from "@/components/search-field";

export function TableToolbar({
  search,
  onSearch,
  searchLabel,
  searchPlaceholder,
  chips,
  filters,
  exportButton,
  applied,
  status,
}: {
  /** The search's text as the list keeps it. */
  search: string;
  onSearch: (text: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** The list's quick chips (a status), where it has them. */
  chips?: ReactNode;
  /** The Filters button (and its dialog): TableFilters. */
  filters: ReactNode;
  /** The Export button, where the list has one. */
  exportButton?: ReactNode;
  /** What Filters applied. */
  applied: readonly AppliedFilter[];
  /** What the list shows, for screen readers; null while it loads. */
  status: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-3">
        {chips !== undefined && (
          <div className="order-last w-full min-w-0 lg:order-first lg:w-auto lg:flex-1">{chips}</div>
        )}
        <SearchField
          initial={search}
          onSearch={onSearch}
          label={searchLabel}
          placeholder={searchPlaceholder}
          className="min-w-48 flex-1 md:w-80 md:flex-none"
        />
        {exportButton}
        {filters}
      </div>
      <AppliedFilters chips={applied} />
      <p role="status" className="sr-only">
        {status}
      </p>
    </div>
  );
}
