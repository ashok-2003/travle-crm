"use client";

// The packages list on a phone: a row per trip with its From price, next departure and seats left, and its badges.
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import type { RefObject } from "react";
import { TextLink } from "@/components/text-link";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { packageRoute } from "@/lib/routes";
import { PackageBadges, PhoneLine } from "./package-list-words";
import { PackageRowMenu } from "./package-row-menu";

/** What a row's menu calls to start deleting a trip: the trip, and the menu's button that gets the focus back. */
export interface AskToDelete {
  onDelete: (one: QuotePackage, returnFocusTo: RefObject<HTMLButtonElement | null>) => void;
}

export function PackagesRows({
  packages,
  mayEdit,
  onDelete,
}: { packages: QuotePackage[]; mayEdit: boolean } & AskToDelete) {
  return (
    <ItemGroup>
      {packages.map((one) => (
        <Item key={one.id} size="sm">
          <ItemContent>
            <ItemTitle>
              {mayEdit ? (
                <TextLink inline href={packageRoute(one.id)}>
                  {one.name}
                </TextLink>
              ) : (
                one.name
              )}
            </ItemTitle>
            <ItemDescription>
              <PhoneLine one={one} />
            </ItemDescription>
            <div className="flex flex-wrap gap-1">
              <PackageBadges one={one} />
            </div>
          </ItemContent>
          {mayEdit && (
            <ItemActions>
              <PackageRowMenu one={one} onDelete={onDelete} />
            </ItemActions>
          )}
        </Item>
      ))}
    </ItemGroup>
  );
}
