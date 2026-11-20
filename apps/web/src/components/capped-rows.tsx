"use client";

// A work list's rows on a phone (WorkTable), where a long list is a long page: the first five and a button for the rest.
// `after` (a next page's button) waits until the rest is shown.
import { Fragment, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";

const phoneRowLimit = 5;

export function CappedRows({
  name,
  rows,
  label,
  after,
}: {
  /** The list's name for screen readers: its tab's. */
  name: string;
  /** Each row with its own stable key. */
  rows: { id: string; row: ReactNode }[];
  /** The button's words: "Show more overdue". */
  label: string;
  after?: ReactNode | undefined;
}) {
  const [all, setAll] = useState(false);
  const capped = !all && rows.length > phoneRowLimit;
  return (
    <div className="flex flex-col gap-3">
      <ItemGroup aria-label={name} className="gap-0">
        {(capped ? rows.slice(0, phoneRowLimit) : rows).map(({ id, row }, index) => (
          <Fragment key={id}>
            {index > 0 && <ItemSeparator className="my-0" />}
            {row}
          </Fragment>
        ))}
      </ItemGroup>
      {capped ? (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => {
            setAll(true);
          }}
        >
          {label}
        </Button>
      ) : (
        after
      )}
    </div>
  );
}
