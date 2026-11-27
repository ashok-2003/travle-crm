"use client";

// A list as a server-side table (bookings revamp, 2026-11-27; the look of the AiGuru admin table the owner chose): its
// toolbar above, then the registry Table with sortable headers, its header row held at the top while the rows scroll
// inside the table's own box (which reaches at most the window's bottom, the first column pinned when it scrolls
// sideways), and the numbered pages under it: "Showing 1–25 of 132", rows per page, the arrows. The api searches,
// filters, sorts and pages; this shows what it sent. A row opens its record: its own link (in a cell) for the keyboard and
// screen readers, a press anywhere else on it for a mouse. Below 1024px the columns can't all show, so the rows stack, each
// one link (`stacked` says what it holds). Loading shows skeleton rows, and another page keeps the rows in view, faded,
// until it arrives; a failure says so with Try again (a refusal its reason); an empty list shows `empty`.
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { TablePagination } from "@/components/table-pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pinnedCell, useRestOfWindow, useTableFits } from "@/components/work-table";
import { cn } from "@/lib/utils";
import { ariaSortOf, SortButton, type TableSort } from "./sort-button";
import { StackedRows } from "./stacked-rows";

export type { TableSort } from "./sort-button";

export interface DataColumn<Row, Sort extends string> {
  key: string;
  header: string;
  /** What the api orders by when this header is pressed; a column without one doesn't sort. */
  sort?: Sort;
  /** Its width in px; a text column has none and shares what the fixed ones leave, 160 at least. */
  width?: number;
  /** Right-aligned, as amounts are. */
  end?: boolean;
  cell: (row: Row) => ReactNode;
}

const textMinimum = 160;

export function DataTable<Row, Sort extends string>({
  label,
  columns,
  rows,
  rowKey,
  rowHref,
  stacked,
  total,
  page,
  limit,
  sizes,
  noun,
  onPage,
  onLimit,
  sort,
  onSort,
  busy,
  error,
  onRetry,
  loadFailed,
  loadingLabel,
  toolbar,
  empty,
}: {
  /** The table's (and a phone's list's) name. */
  label: string;
  /** The first is pinned at the left when the table scrolls sideways; it holds the row's link. */
  columns: readonly DataColumn<Row, Sort>[];
  /** The page's rows; undefined until the first page arrives. */
  rows: readonly Row[] | undefined;
  rowKey: (row: Row) => string;
  /** Where a row leads: its record's page. */
  rowHref: (row: Row) => string;
  /** A phone's row: what its link holds. */
  stacked: (row: Row) => ReactNode;
  /** How many rows match on every page. */
  total: number;
  page: number;
  limit: number;
  sizes: readonly number[];
  /** What the rows are, counted for the total: "bookings". */
  noun: string;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
  sort: TableSort<Sort>;
  onSort: (sort: TableSort<Sort>) => void;
  /** Another page, size, sort or filter is loading: the rows in view are the last one's. */
  busy: boolean;
  /** Why the page didn't load, or null. */
  error: unknown;
  onRetry: () => void;
  /** What didn't load, for a failure with no reason: "Bookings didn't load." */
  loadFailed: string;
  loadingLabel: string;
  /** The search, Export and Filters, and whatever else sits over the rows (chips). */
  toolbar: ReactNode;
  /** What an empty list says. */
  empty: ReactNode;
}) {
  const wide = useTableFits();
  const router = useRouter();
  const [attachBox, boxHeight] = useRestOfWindow();
  const body = (): ReactNode => {
    if (error !== null && error !== undefined) {
      return <LoadFailedAlert message={loadFailed} error={error} onRetry={onRetry} />;
    }
    // Nothing yet, or a page past the last (the screen moves to the last).
    if (rows === undefined || (rows.length === 0 && total > 0)) {
      return <LoadingRows shape={wide ? "table" : "twoLines"} columns={columns.length} label={loadingLabel} />;
    }
    if (rows.length === 0) return empty;
    const pages = (
      <TablePagination
        page={page}
        size={limit}
        total={total}
        noun={noun}
        sizes={sizes}
        busy={busy}
        onPage={onPage}
        onSize={onLimit}
      />
    );
    const fading = cn("motion-safe:transition-opacity", busy && "opacity-60");
    if (!wide) {
      return (
        <div className="flex flex-col gap-4">
          <StackedRows label={label} rows={rows} rowKey={rowKey} rowHref={rowHref} stacked={stacked} busy={busy} />
          {pages}
        </div>
      );
    }
    const minWidth = columns.reduce((sum, column) => sum + (column.width ?? textMinimum), 0);
    return (
      // The rows scroll inside their own box under the header row, the pages after it; together they reach at most the
      // window's bottom. The registry's container scrolls only sideways; this box scrolls both ways, so the header pins.
      <div ref={attachBox} style={boxHeight} className="flex flex-col gap-4">
        <div
          data-slot="data-table"
          aria-busy={busy}
          className={cn("min-h-0 overflow-auto [&>[data-slot=table-container]]:overflow-visible", fading)}
        >
          <Table aria-label={label} className="table-fixed" style={{ minWidth }}>
            <TableHeader>
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead
                    key={column.key}
                    scope="col"
                    style={column.width === undefined ? undefined : { width: column.width }}
                    aria-sort={ariaSortOf(column.sort, sort)}
                    className={cn(
                      "sticky top-0 bg-background",
                      index === 0 && "left-0 z-(--z-sticky)",
                      column.end === true && "text-right",
                    )}
                  >
                    {column.sort === undefined ? (
                      column.header
                    ) : (
                      <SortButton
                        header={column.header}
                        end={column.end === true}
                        by={column.sort}
                        sort={sort}
                        onSort={onSort}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  className="cursor-pointer"
                  onClick={(event) => {
                    // A press on the row's own link or a button in it is theirs.
                    if (event.target instanceof Element && event.target.closest("a, button") !== null) return;
                    router.push(rowHref(row));
                  }}
                >
                  {columns.map((column, index) => (
                    <TableCell
                      key={column.key}
                      className={cn(
                        "align-top whitespace-normal wrap-anywhere",
                        index === 0 && cn("sticky left-0", pinnedCell),
                        column.end === true && "text-right",
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pages}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      {body()}
    </div>
  );
}
