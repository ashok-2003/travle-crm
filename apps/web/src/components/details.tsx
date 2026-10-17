// A list of labelled values (a person's email, the organization's code), compact: the registry's ItemGroup of plain
// Items, each one row with the label (the Item's description, muted) and then the value (its title, in ink) at the
// row's end. The value wraps under the label only when the row is too narrow for both, and however long it is. An
// optional hint says more about the row on a line of its own, and an optional action (copy, change) comes last. A
// row with an action always puts its value under its label, so rows of things to copy read alike whatever their
// length. The Items' own spacing parts the rows: no separators.
import type { ReactNode } from "react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";

export interface Detail {
  /** Also the row's key: labels in one list differ. */
  label: string;
  value?: ReactNode;
  /** More about the row, under it ("Staff without email sign in with this code"). */
  hint?: ReactNode;
  action?: ReactNode;
}

export function Details({ rows }: { rows: Detail[] }) {
  return (
    <ItemGroup>
      {rows.map(({ label, value, hint, action }) => (
        <Item key={label} size="sm" role="listitem">
          <ItemContent className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <ItemDescription>{label}</ItemDescription>
            {value !== undefined && (
              <ItemTitle className={cn("flex-wrap wrap-anywhere", action !== undefined && "basis-full")}>
                {value}
              </ItemTitle>
            )}
            {hint !== undefined && <ItemDescription className="basis-full">{hint}</ItemDescription>}
          </ItemContent>
          {action !== undefined && <ItemActions>{action}</ItemActions>}
        </Item>
      ))}
    </ItemGroup>
  );
}
