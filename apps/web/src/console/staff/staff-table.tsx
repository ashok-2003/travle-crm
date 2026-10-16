"use client";

// Platform staff on tablets and wider (DESIGN.md section 6): a table of each person's name, address, level and whether
// they can use the console yet, and when they were added; the removed apart, with when. The viewer is marked "You"
// and has no actions: another super admin changes a super admin.
import type { PlatformStaffEntry } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { useStaff } from "../session/staff-context";
import { SignInState } from "./sign-in-state";
import { StaffActions } from "./staff-actions";

export function StaffTable({ people, removed = false }: { people: PlatformStaffEntry[]; removed?: boolean }) {
  const t = useTranslations("consolePlatform.staff");
  const tLevels = useTranslations("console.levels");
  const viewer = useStaff();
  const dayOf = (iso: string) => formatDay(new Date(iso), { timeZone: PLATFORM_TIME_ZONE });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.name")}</TableHead>
          <TableHead scope="col">{t("columns.email")}</TableHead>
          {!removed && <TableHead scope="col">{t("columns.level")}</TableHead>}
          {!removed && <TableHead scope="col">{t("columns.state")}</TableHead>}
          <TableHead scope="col" className="text-right">
            {removed ? t("columns.removed") : t("columns.added")}
          </TableHead>
          {!removed && (
            <TableHead scope="col">
              <span className="sr-only">{t("columns.actions")}</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {people.map((person) => {
          const isViewer = person.userId === viewer.userId;
          return (
            <TableRow key={person.userId}>
              <TableCell className="whitespace-normal">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium script-leading">{person.name}</span>
                  {isViewer && <span className="text-caption text-muted-foreground">{t("you")}</span>}
                </span>
              </TableCell>
              <TableCell className="whitespace-normal break-all">{person.email}</TableCell>
              {!removed && <TableCell>{person.level === null ? null : tLevels(person.level)}</TableCell>}
              {!removed && (
                <TableCell>
                  <SignInState person={person} />
                </TableCell>
              )}
              <TableCell className="numbers text-right">{dayOf(person.removedAt ?? person.createdAt)}</TableCell>
              {!removed && (
                <TableCell className="text-right">{!isViewer && <StaffActions person={person} />}</TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
