"use client";

// A list of work as a table (web revamp part 2: My tasks' tabs, Follow-ups), a thin composition of the registry Table:
// fixed column widths, the text columns sharing what is left above a minimum, text wrapping in its column. When the
// screen is narrower than the columns, the table scrolls sideways inside its own box with the Customer column pinned
// at the left and the buttons at the right; the box reaches at most the bottom of the window and scrolls down inside
// itself under its pinned header row, the next page's button after the rows. Pinned cells take the page's background
// and nothing else (UI rule 2). Below 1024px (a phone, a tablet beside the sidebar) the columns can't all show, so the
// rows stack: each one's cells, then its buttons, five rows and Show more (CappedRows).
import { useEffect, useState, type ReactNode } from "react";
import { CappedRows } from "@/components/capped-rows";
import { Item, ItemActions, ItemContent } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export interface WorkColumn<Row> {
  header: string;
  /** Its width in px; a text column has none and shares what the fixed ones leave, `min` at least (180). */
  width?: number;
  min?: number;
  /** Right-aligned, as amounts are. */
  end?: boolean;
  cell: (row: Row) => ReactNode;
}

const textMinimum = 180;
/** The frame's foot under the page from tablets up (app-frame's md:pb-8): the box stops above it. */
const frameFoot = 32;
/** The box never gets shorter than about six rows, however short the window. */
const shortest = 320;

// A pinned cell covers what scrolls under it, so it is opaque: the page's background, the registry row's hover tint
// (muted at half) mixed into it while the row is hovered, and a chosen row's muted tint (the Leads table's).
export const pinnedCell =
  "bg-background in-[tr:hover]:bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] in-[tr[data-state=selected]]:bg-muted";

/** Long text in a column: three lines at most, then "…", and the whole of it in its title. */
export function ClampedText({ text }: { text: string }) {
  return (
    <span title={text} className="line-clamp-3 script-leading">
      {text}
    </span>
  );
}

/** The box's greatest height: from its top to the window's bottom, above the frame's foot (the data table's too). */
export function useRestOfWindow() {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [maxHeight, setMaxHeight] = useState<number>();
  useEffect(() => {
    if (box === null) return;
    const measure = () => {
      const top = box.getBoundingClientRect().top + window.scrollY;
      setMaxHeight(Math.max(window.innerHeight - top - frameFoot, shortest));
    };
    measure();
    window.addEventListener("resize", measure);
    // What sits above the box (a line that loads later, a banner) moves it: each ancestor's size says so.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    for (let node = box.parentElement; node !== null; node = node.parentElement) observer?.observe(node);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [box]);
  return [setBox, maxHeight === undefined ? undefined : { maxHeight }] as const;
}

/** Whether the screen is wide enough for a work table (1024px, owner 2026-11-19); below it the rows stack. */
export function useTableFits(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

export function WorkTable<Row>({
  label,
  rows,
  rowKey,
  columns,
  actions,
  more,
  after,
}: {
  /** The table's name: the tab's. */
  label: string;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** The first is the Customer column, pinned at the left. */
  columns: readonly WorkColumn<Row>[];
  /** The buttons, pinned at the right: one width for the tab, its header for screen readers only. */
  actions: { header: string; width: number; cell: (row: Row) => ReactNode };
  /** On a phone, the button that shows the rows after the first five: "Show more overdue". */
  more: string;
  /** The next page's button, after the rows. */
  after?: ReactNode;
}) {
  const wide = useTableFits();
  const [attachBox, boxHeight] = useRestOfWindow();
  if (!wide) {
    return (
      <CappedRows
        name={label}
        label={more}
        after={after}
        rows={rows.map((row) => ({
          id: rowKey(row),
          row: (
            <Item size="sm" role="listitem">
              <ItemContent className="min-w-0 basis-full gap-1">
                {columns.map((column) => {
                  const content = column.cell(row);
                  return content === null || content === false ? null : <div key={column.header}>{content}</div>;
                })}
              </ItemContent>
              <ItemActions className="flex-wrap gap-3">{actions.cell(row)}</ItemActions>
            </Item>
          ),
        }))}
      />
    );
  }
  const minWidth = columns.reduce((sum, column) => sum + (column.width ?? column.min ?? textMinimum), actions.width);
  return (
    // The registry's container scrolls only sideways; this box scrolls both ways, so the header pins to it.
    <div
      data-slot="work-table"
      ref={attachBox}
      style={boxHeight}
      className="flex flex-col gap-3 overflow-auto [&>[data-slot=table-container]]:overflow-visible"
    >
      <Table aria-label={label} className="table-fixed" style={{ minWidth }}>
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead
                key={column.header}
                scope="col"
                style={column.width === undefined ? undefined : { width: column.width }}
                className={cn(
                  "sticky top-0 bg-background",
                  index === 0 && "left-0 z-(--z-sticky)",
                  column.end === true && "text-right",
                )}
              >
                {column.header}
              </TableHead>
            ))}
            <TableHead
              scope="col"
              style={{ width: actions.width }}
              className="sticky top-0 right-0 z-(--z-sticky) bg-background"
            >
              <span className="sr-only">{actions.header}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column, index) => (
                <TableCell
                  key={column.header}
                  className={cn(
                    "align-top wrap-anywhere",
                    index === 0 && cn("sticky left-0", pinnedCell),
                    column.end === true && "text-right",
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
              <TableCell className={cn("sticky right-0 align-top", pinnedCell)}>
                <div className="flex flex-wrap justify-end gap-3">{actions.cell(row)}</div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {after}
    </div>
  );
}
