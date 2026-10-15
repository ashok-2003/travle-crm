// A list of labelled values (a person's email, the organization's code): the registry's ItemGroup of plain Items with
// an ItemSeparator between them, each Item's description the label and its title the value, which wraps however long,
// and an optional action at the end (copy, change).
import { Fragment, type ReactNode } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";

export interface Detail {
  /** Also the row's key: labels in one list differ. */
  label: string;
  value?: ReactNode;
  action?: ReactNode;
}

export function Details({ rows }: { rows: Detail[] }) {
  return (
    <ItemGroup>
      {rows.map(({ label, value, action }, index) => (
        <Fragment key={label}>
          {index > 0 && <ItemSeparator />}
          <Item size="sm" role="listitem">
            <ItemContent>
              <ItemDescription>{label}</ItemDescription>
              {value !== undefined && <ItemTitle className="flex-wrap wrap-anywhere">{value}</ItemTitle>}
            </ItemContent>
            {action !== undefined && <ItemActions>{action}</ItemActions>}
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  );
}
