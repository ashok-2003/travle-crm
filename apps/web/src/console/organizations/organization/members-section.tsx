"use client";

// The organization's active members (organizations.members): name, role (Owners marked), email or none, last activity
// in the organization's zone, and what support may do for each: sign in as them, and resend the invite to one still
// to choose a password. A table from tablets up, a divided list on phones; names wrap rather than being cut off.
import type { OrganizationMember, OrganizationRecord } from "@travel-crm/contracts/platform";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "@/lib/format";
import { shownEmail } from "@/lib/shown-email";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useConsoleTRPC } from "../../data/console-trpc";
import { DetailSection } from "./detail-list";
import { ImpersonateDialog } from "./impersonate-dialog";
import { ResendInviteButton } from "./resend-invite-button";

export function MembersSection({ organization }: { organization: OrganizationRecord }) {
  const t = useTranslations("consoleOrganizations.members");
  const tCommon = useTranslations("common");
  const wide = useWideScreen();
  const trpc = useConsoleTRPC();
  const members = useQuery(trpc.organizations.members.queryOptions({ organizationId: organization.id }));

  const lastActive = (lastActiveAt: string) => formatDay(new Date(lastActiveAt), { timeZone: organization.timeZone });
  const invitePending = (member: OrganizationMember) =>
    !member.hasPassword && member.email !== null && <StatusBadge tone="attention">{t("invitePending")}</StatusBadge>;
  const email = (member: OrganizationMember) =>
    shownEmail(member.email) ?? <span className="text-muted-foreground">{t("noEmail")}</span>;
  const actions = (member: OrganizationMember) => (
    <span className="flex flex-wrap justify-end gap-2">
      {invitePending(member) && <ResendInviteButton organizationId={organization.id} member={member} />}
      <ImpersonateDialog member={member} organizationName={organization.name} />
    </span>
  );

  let content;
  if (!members.data) {
    content = members.isError ? (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void members.refetch()} />
    ) : (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </Delayed>
    );
  } else if (members.data.length === 0) {
    content = <p className="text-muted-foreground">{t("empty")}</p>;
  } else if (!wide) {
    content = (
      <ul className="divide-y rounded-lg border">
        {members.data.map((member) => (
          <li key={member.memberId} className="flex flex-col gap-1 px-4 py-3">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words script-leading">{member.name}</span>
              {invitePending(member)}
            </span>
            <span className="text-label break-all text-muted-foreground script-leading">
              {member.roleName} · {email(member)}
            </span>
            <span className="text-label text-muted-foreground">
              {member.lastActiveAt === null
                ? t("neverUsed")
                : t("lastActive", { date: lastActive(member.lastActiveAt) })}
            </span>
            <span className="mt-2 flex justify-start">{actions(member)}</span>
          </li>
        ))}
      </ul>
    );
  } else {
    content = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("columns.name")}</TableHead>
            <TableHead scope="col">{t("columns.role")}</TableHead>
            <TableHead scope="col">{t("columns.email")}</TableHead>
            <TableHead scope="col" className="text-right">
              {t("columns.lastActive")}
            </TableHead>
            <TableHead scope="col">
              <span className="sr-only">{t("columns.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.data.map((member) => (
            <TableRow key={member.memberId}>
              <TableCell className="font-medium whitespace-normal script-leading">{member.name}</TableCell>
              <TableCell className="whitespace-normal">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="script-leading">{member.roleName}</span>
                  {invitePending(member)}
                </span>
              </TableCell>
              <TableCell className="whitespace-normal break-all">{email(member)}</TableCell>
              <TableCell className="text-right">
                {member.lastActiveAt === null ? (
                  <span className="text-muted-foreground">{t("neverActive")}</span>
                ) : (
                  <span className="numbers">{lastActive(member.lastActiveAt)}</span>
                )}
              </TableCell>
              <TableCell className="text-right">{actions(member)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <DetailSection id="members-heading" heading={t("heading")} wide>
      {content}
    </DetailSection>
  );
}
