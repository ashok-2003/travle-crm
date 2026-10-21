// A breakdown of counts as bars (the dashboard's sources, stages and waits): each row its words, its count in mono,
// and a bar as long as its share of the largest, in one colour or the row's own (a stage's). Plain HTML, every number
// in the text: a screen reader reads the list, and nothing hides behind a hover.
import type { ReactNode } from "react";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BarListRow {
  key: string;
  label: ReactNode;
  value: number;
  /** A few words after the count, such as "3 won". */
  detail?: string;
  /** The bar's colour class when it isn't the list's, e.g. a stage's dot. */
  barClassName?: string;
}

export function BarList({ rows, barClassName = "bg-people" }: { rows: readonly BarListRow[]; barClassName?: string }) {
  const largest = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words">{row.label}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="font-mono text-number tabular-nums">{formatCount(row.value)}</span>
              {row.detail !== undefined && <span className="text-caption text-muted-foreground">{row.detail}</span>}
            </span>
          </div>
          <div aria-hidden="true" className="h-1.5 rounded-full bg-surface">
            <div
              className={cn("h-1.5 rounded-full", row.barClassName ?? barClassName)}
              style={{ width: `${String(row.value === 0 ? 0 : Math.max(2, (row.value / largest) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
