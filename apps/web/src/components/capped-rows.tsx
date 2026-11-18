"use client";

// The rows of a section: all of them on a wide screen (the section scrolls), but on a phone, where a long list is a long
// page, the first five and a button for the rest. `after` (a next page's button) waits until the rest is shown.
import { Fragment, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { useWideScreen } from "@/lib/use-wide-screen";

export const phoneRowLimit = 5;

export function CappedRows({
  rows,
  label,
  after,
  role,
}: {
  /** Each row with its own stable key. */
  rows: { id: string; row: ReactNode }[];
  /** The button's words: "Show more overdue". */
  label: string;
  after?: ReactNode | undefined;
  role?: "list" | undefined;
}) {
  const wide = useWideScreen();
  const [all, setAll] = useState(false);
  const capped = !wide && !all && rows.length > phoneRowLimit;
  return (
    <>
      <ItemGroup role={role} className="gap-0">
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
          className="min-h-11 self-center"
          onClick={() => {
            setAll(true);
          }}
        >
          {label}
        </Button>
      ) : (
        after
      )}
    </>
  );
}
