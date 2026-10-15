"use client";

// Platform staff on phones (DESIGN.md section 6): a divided list, each person's name and whether they can use the
// console yet first, then their address, level and when they were added (or removed). The viewer has no actions.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
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
    <ul className="divide-y rounded-lg border">
      {people.map((person) => {
        const isViewer = person.userId === viewer.userId;
        return (
          <li key={person.userId} className="flex items-start gap-2 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-words script-leading">{person.name}</span>
                {isViewer && <span className="text-caption text-muted-foreground">{t("you")}</span>}
              </span>
              <span className="text-label break-all">{person.email}</span>
              <span className="text-caption text-muted-foreground">
                {person.level !== null && `${tLevels(person.level)} · `}
                {removed
                  ? t("removedOn", { day: dayOf(person.removedAt ?? person.createdAt) })
                  : t("addedOn", { day: dayOf(person.createdAt) })}
              </span>
              {!removed && <SignInState person={person} />}
            </div>
            {!removed && !isViewer && <StaffActions person={person} />}
          </li>
        );
      })}
    </ul>
  );
}
