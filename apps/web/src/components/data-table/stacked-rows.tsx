"use client";

// A table's rows on a phone (bookings revamp, 2026-11-27; DESIGN.md: below the table's width a list): each row one link
// to its record, holding what `stacked` gives it, divided by the registry's separators. While another page loads they
// stay in view, faded.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Item, ItemGroup, ItemSeparator } from "@/components/ui/item";
import { cn } from "@/lib/utils";

export function StackedRows<Row>({
  label,
  rows,
  rowKey,
  rowHref,
  stacked,
  busy,
}: {
  label: string;
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  rowHref: (row: Row) => string;
  stacked: (row: Row) => ReactNode;
  busy: boolean;
}) {
  return (
    <ItemGroup
      aria-label={label}
      aria-busy={busy}
      className={cn("motion-safe:transition-opacity", busy && "opacity-60")}
    >
      {rows.map((row, index) => (
        <Fragment key={rowKey(row)}>
          {index > 0 && <ItemSeparator />}
          <div role="listitem">
            <Item asChild size="sm">
              <Link href={rowHref(row)}>{stacked(row)}</Link>
            </Item>
          </div>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
