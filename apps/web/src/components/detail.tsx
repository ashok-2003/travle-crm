// One labelled value in a list of details (a person's email, the organization's code): the registry's outlined Item,
// its description the label and its title the value, which wraps however long, and an optional action at the end
// (copy, change). Each is a list item, for the registry's ItemGroup.
import type { ReactNode } from "react";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";

export function Detail({ label, children, action }: { label: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Item variant="outline" role="listitem">
      <ItemContent>
        <ItemDescription>{label}</ItemDescription>
        {children !== undefined && <ItemTitle className="wrap-anywhere">{children}</ItemTitle>}
      </ItemContent>
      {action !== undefined && <ItemActions>{action}</ItemActions>}
    </Item>
  );
}
