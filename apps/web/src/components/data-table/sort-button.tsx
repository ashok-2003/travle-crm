"use client";

// A table header's sort (bookings revamp, 2026-11-27): the header's words as a button (the registry's quiet, 44px with
// its hit area) with an arrow saying how the table is sorted by it, or that it can be. Pressing it sorts by that column,
// soonest or smallest first (or as the column says: a last change newest first); pressing the one sorted by turns it
// round. Its header cell says the same to screen readers (ariaSortOf).
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TableSort<Sort extends string> {
  key: Sort;
  direction: "asc" | "desc";
}

/** What a header cell's aria-sort says: how the table is sorted by its column, or nothing. */
export function ariaSortOf<Sort extends string>(
  by: Sort | undefined,
  sort: TableSort<Sort>,
): "ascending" | "descending" | undefined {
  if (by === undefined || by !== sort.key) return undefined;
  return sort.direction === "asc" ? "ascending" : "descending";
}

const nextSort = <Sort extends string>(sort: TableSort<Sort>, key: Sort, first: TableSort<Sort>["direction"]) =>
  sort.key === key
    ? { key, direction: sort.direction === "asc" ? ("desc" as const) : ("asc" as const) }
    : { key, direction: first };

export function SortButton<Sort extends string>({
  header,
  end,
  by,
  first,
  sort,
  onSort,
}: {
  header: string;
  /** A right-aligned column's. */
  end: boolean;
  by: Sort;
  /** Which way its first press sorts: soonest or smallest first, or newest first for a last change. */
  first: TableSort<Sort>["direction"];
  sort: TableSort<Sort>;
  onSort: (sort: TableSort<Sort>) => void;
}) {
  const active = sort.key === by;
  const Icon = !active ? ChevronsUpDownIcon : sort.direction === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Button
      variant="quiet"
      size="sm"
      className={end ? "-mr-4" : "-ml-4"}
      onClick={() => {
        onSort(nextSort(sort, by, first));
      }}
    >
      {header}
      <Icon aria-hidden="true" className={cn(!active && "text-muted-foreground")} />
    </Button>
  );
}
