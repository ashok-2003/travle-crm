// A list of labelled values (a person's email, the organization's code), compact: the registry's ItemGroup of plain
// Items, each one row with the label (the Item's description, muted) and then the value (its title, in ink) at the
// row's end. The value wraps under the label only when the row is too narrow for both, and however long it is. An
// optional action (copy, change) comes last. The Items' own spacing parts the rows: no separators.
import type { ReactNode } from "react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";

export interface Detail {
  /** Also the row's key: labels in one list differ. */
  label: string;
  value?: ReactNode;
  action?: ReactNode;
}

export function Details({ rows }: { rows: Detail[] }) {
  return (
    <ItemGroup>
      {rows.map(({ label, value, action }) => (
        <Item key={label} size="sm" role="listitem">
          <ItemContent className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <ItemDescription>{label}</ItemDescription>
            {value !== undefined && <ItemTitle className="flex-wrap wrap-anywhere">{value}</ItemTitle>}
          </ItemContent>
          {action !== undefined && <ItemActions>{action}</ItemActions>}
        </Item>
      ))}
    </ItemGroup>
  );
}
