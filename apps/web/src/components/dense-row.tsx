// A list row of two lines (My tasks, Follow-ups): the person and what to do with the when-mark at the right, then one
// muted line (clamped, full text in its title) with the buttons at the right. A phone has no room beside the text, so
// there the parts wrap and the buttons sit under it.
import type { ReactNode } from "react";
import { Item, ItemActions, ItemDescription } from "@/components/ui/item";

export function DenseRow({
  line,
  when,
  detail,
  actions,
}: {
  /** Line 1: the name and what to do; the last part should truncate. */
  line: ReactNode;
  /** At the right of line 1. */
  when?: ReactNode;
  /** Line 2, plain text. */
  detail: string;
  /** At the right of line 2. */
  actions?: ReactNode;
}) {
  return (
    <Item size="sm" role="listitem" className="py-1">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 md:flex-nowrap">
          <div className="flex min-w-0 flex-1 basis-48 flex-wrap md:overflow-hidden items-baseline gap-x-2 md:flex-nowrap">
            {line}
          </div>
          {when}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          {detail !== "" && (
            <ItemDescription
              title={detail}
              className="line-clamp-1 min-w-0 basis-full script-leading md:flex-1 md:basis-40"
            >
              {detail}
            </ItemDescription>
          )}
          <ItemActions className="max-w-full shrink-0 flex-wrap md:ml-auto">{actions}</ItemActions>
        </div>
      </div>
    </Item>
  );
}
