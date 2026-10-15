"use client";

// The staff list (DESIGN.md section 6): a table on tablets and wider, a divided list on phones with the name and
// status on the first line and the details on the second. Names wrap rather than being cut off.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { useWideScreen } from "../responsive-dialog";
import { StaffActions } from "./staff-actions";
import { signInName } from "./staff-details";

export function StaffList({ staff, roles }: { staff: StaffMember[]; roles: RoleSummary[] }) {
  const t = useTranslations("staff");
  const me = useMe();
  const wide = useWideScreen();
  const joined = (member: StaffMember) => formatDay(new Date(member.joinedAt), { timeZone: me.organization.timeZone });
  const isMe = (member: StaffMember) => member.memberId === me.member.memberId;
  const status = (member: StaffMember) =>
    member.mustChangePassword ? <StatusBadge tone="attention">{t("mustChangePassword")}</StatusBadge> : null;
  const actions = (member: StaffMember) =>
    isMe(member) ? (
      <span className="text-label text-muted-foreground">{t("you")}</span>
    ) : (
      <StaffActions member={member} roles={roles} />
    );

  if (!wide) {
    return (
      <ul className="divide-y rounded-lg border">
        {staff.map((member) => (
          <li key={member.memberId} className="flex items-start gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-words">{member.name}</span>
                {status(member)}
              </div>
              <p className="text-label text-muted-foreground break-words">
                {member.role.name} · {signInName(member)} · {t("joinedOn", { date: joined(member) })}
              </p>
            </div>
            {actions(member)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t("columns.name")}</TableHead>
          <TableHead scope="col">{t("columns.signIn")}</TableHead>
          <TableHead scope="col">{t("columns.role")}</TableHead>
          <TableHead scope="col">{t("columns.twoFactor")}</TableHead>
          <TableHead scope="col" className="text-right">
            {t("columns.joined")}
          </TableHead>
          <TableHead scope="col">
            <span className="sr-only">{t("columns.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.map((member) => (
          <TableRow key={member.memberId}>
            <TableCell className="whitespace-normal">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{member.name}</span>
                {status(member)}
              </div>
            </TableCell>
            <TableCell className="whitespace-normal break-all">{signInName(member)}</TableCell>
            <TableCell className="whitespace-normal">{member.role.name}</TableCell>
            <TableCell>{member.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}</TableCell>
            <TableCell className="numbers text-right">{joined(member)}</TableCell>
            <TableCell className="text-right">{actions(member)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
