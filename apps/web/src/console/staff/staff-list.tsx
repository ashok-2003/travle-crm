"use client";

// Platform staff on phones (DESIGN.md section 6): a list of items, each person's name and whether they can use the
// console yet first, then their address, level and when they were added (or removed). The viewer has no actions.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { formatDay } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "../platform-time-zone";
import { useStaff } from "../session/staff-context";
import { SignInState } from "./sign-in-state";
import { StaffActions } from "./staff-actions";

export function StaffList({ people, removed = false }: { people: PlatformStaffEntry[]; removed?: boolean }) {
  const t = useTranslations("consolePlatform.staff");
  const tLevels = useTranslations("console.levels");
  const viewer = useStaff();
  const dayOf = (iso: string) => formatDay(new Date(iso), { timeZone: PLATFORM_TIME_ZONE });
  return (
    <ItemGroup>
      {people.map((person, index) => {
        const isViewer = person.userId === viewer.userId;
        return (
          <Fragment key={person.userId}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem" className="items-start">
              <ItemContent className="min-w-0">
                <ItemTitle className="flex-wrap">
                  <span className="script-leading">{person.name}</span>
                  {isViewer && <span className="text-caption font-normal text-muted-foreground">{t("you")}</span>}
                </ItemTitle>
                <span className="text-label break-all">{person.email}</span>
                <ItemDescription>
                  {person.level !== null && `${tLevels(person.level)} · `}
                  {removed
                    ? t("removedOn", { day: dayOf(person.removedAt ?? person.createdAt) })
                    : t("addedOn", { day: dayOf(person.createdAt) })}
                </ItemDescription>
                {!removed && <SignInState person={person} />}
              </ItemContent>
              {!removed && !isViewer && (
                <ItemActions>
                  <StaffActions person={person} />
                </ItemActions>
              )}
            </Item>
          </Fragment>
        );
      })}
    </ItemGroup>
  );
}
