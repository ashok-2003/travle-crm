"use client";

// A table's toolbar (bookings revamp, 2026-11-27): the search box, Export and Filters at the top right of the table. On a
// phone the search takes what the buttons leave on their line, or the line to itself when that would be too narrow (the
// buttons then sit under it at the right). The search is the lead list's box (sent once typing pauses, its own words
// given here); the list remounts the toolbar's search with a new key to empty it.
import type { ReactNode } from "react";
import { SearchField } from "@/leads/list/search-field";

export function TableToolbar({
  search,
  onSearch,
  searchLabel,
  searchPlaceholder,
  filters,
  exportButton,
}: {
  /** The search's text as the list keeps it. */
  search: string;
  onSearch: (text: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** The Filters button (and its dialog). */
  filters: ReactNode;
  /** The Export button, where the list has one. */
  exportButton?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
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
  );
}
