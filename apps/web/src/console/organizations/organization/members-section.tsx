"use client";

// The organization's active members (organizations.members): name, role (Owners marked), email or none, last activity
// in the organization's zone, and what support may do for each: sign in as them, and resend the invite to one still
// to choose a password. A table from tablets up, a list of items on phones; names wrap rather than being cut off.
import type { OrganizationMember, OrganizationRecord } from "@travel-crm/contracts/platform";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { StatusBadge } from "@/components/status-badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
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
  // The agency may have given the Owner role another name: an Owner is marked whatever their role is called.
  const ownerMark = (member: OrganizationMember) =>
    member.isOwner && member.roleName !== t("owner") && <StatusBadge tone="neutral">{t("owner")}</StatusBadge>;
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
      <LoadingRows rows={2} shape="twoLines" label={t("loading")} />
    );
  } else if (members.data.length === 0) {
    content = <p className="text-muted-foreground">{t("empty")}</p>;
  } else if (!wide) {
    content = (
      <ItemGroup>
        {members.data.map((member, index) => (
          <Fragment key={member.memberId}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem">
              <ItemContent>
                <ItemTitle className="flex-wrap">
                  <span className="script-leading">{member.name}</span>
                  {ownerMark(member)}
                  {invitePending(member)}
                </ItemTitle>
                <ItemDescription>
                  <span className="break-all script-leading">
                    {member.roleName} · {email(member)}
                  </span>
                </ItemDescription>
                <ItemDescription>
                  {t("lastActive", {
                    date: member.lastActiveAt === null ? t("neverActive") : lastActive(member.lastActiveAt),
                  })}
                </ItemDescription>
              </ItemContent>
              <ItemActions>{actions(member)}</ItemActions>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
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
                  {ownerMark(member)}
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
