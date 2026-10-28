"use client";

// /console/invites (the invite program, the owner, 2026-10-28): every invite, newest first, with how its link has done
// (not opened, opened how often and when, joined), the link and a ready message to send its founder, and the way to
// cancel one not yet used; the program's figures above; inviting more companies from a sheet's rows; and the whole
// list copied as a sheet (tab-separated, for Google Sheets), links and messages in it.
import type { VipInvite } from "@travel-crm/contracts/platform";
import { brand } from "@travel-crm/brand";
import { CrownIcon, EyeIcon, MailOpenIcon, PlusIcon, SendIcon, UserCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCount, formatDayTime, formatPhoneNumber } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { consoleRoutes } from "../routes";
import { AddInvitesDialog } from "./add-invites-dialog";
import { Figures } from "./figures";
import { useCancelInvite, useInvites } from "./use-growth";

const tones: Record<VipInvite["status"], StatusTone> = {
  sent: "neutral",
  opened: "attention",
  joined: "good",
  cancelled: "bad",
};

/** A sheet's cell: no tab or line break inside it. */
const cell = (value: string | null) => (value ?? "").replace(/[\t\r\n]+/g, " ");

export function InvitesScreen() {
  const t = useTranslations("consoleGrowth.invites");
  const tCommon = useTranslations("common");
  const invites = useInvites();
  const cancel = useCancelInvite();
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const when = (iso: string | null) =>
    iso === null ? "–" : formatDayTime(new Date(iso), { timeZone: PLATFORM_TIME_ZONE });
  const messageFor = (invite: VipInvite) =>
    t("message", {
      owner: invite.ownerName.split(/\s+/)[0] ?? invite.ownerName,
      company: invite.companyName,
      days: invite.trialDays,
      product: brand.productName,
      link: invite.url,
    });

  const copySheet = async (items: VipInvite[]) => {
    const header = [
      t("sheet.company"),
      t("sheet.owner"),
      t("sheet.phone"),
      t("sheet.email"),
      t("sheet.city"),
      t("sheet.status"),
      t("sheet.opens"),
      t("sheet.lastOpened"),
      t("sheet.link"),
      t("sheet.message"),
    ];
    const lines = items.map((invite) =>
      [
        invite.companyName,
        invite.ownerName,
        invite.ownerPhone,
        invite.ownerEmail,
        invite.city,
        t(`status.${invite.status}`),
        String(invite.openCount),
        when(invite.lastOpenedAt),
        invite.url,
        messageFor(invite),
      ]
        .map(cell)
        .join("\t"),
    );
    try {
      await navigator.clipboard.writeText([header.join("\t"), ...lines].join("\n"));
      toast.success(t("copied", { count: items.length }));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  let content;
  const data = invites.data;
  if (data === undefined) {
    content = invites.isError ? (
      <ErrorState
        message={t("loadFailed")}
        error={invites.error}
        retryLabel={tCommon("tryAgain")}
        onRetry={() => void invites.refetch()}
      />
    ) : (
      <LoadingRows rows={4} shape="twoLines" label={t("loading")} />
    );
  } else if (data.items.length === 0) {
    content = <EmptyState icon={CrownIcon} message={t("empty")} />;
  } else {
    content = (
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.company")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.opens")}</TableHead>
                <TableHead>{t("columns.lastOpened")}</TableHead>
                <TableHead className="text-right">{t("columns.send")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{invite.companyName}</span>
                      <span className="text-caption text-muted-foreground">
                        {invite.ownerName}
                        {invite.ownerPhone === null ? "" : ` · ${formatPhoneNumber(invite.ownerPhone)}`}
                        {invite.city === null ? "" : ` · ${invite.city}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge tone={tones[invite.status]}>{t(`status.${invite.status}`)}</StatusBadge>
                      {invite.organizationId !== null && (
                        <TextLink inline href={consoleRoutes.organizationUsage(invite.organizationId)}>
                          {t("seeUsage")}
                        </TextLink>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="numbers">{formatCount(invite.openCount)}</TableCell>
                  <TableCell className="text-caption">
                    {when(invite.lastOpenedAt)}
                    {invite.firstOpenedAt !== null && invite.openCount > 1 && (
                      <span className="block text-muted-foreground">
                        {t("first", { when: when(invite.firstOpenedAt) })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1">
                      <CopyButton value={invite.url} label={t("copyLink")} />
                      <CopyButton value={messageFor(invite)} label={t("copyMessage")} />
                      {invite.status !== "joined" && invite.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          disabled={cancel.isPending}
                          onClick={() => {
                            cancel.mutate({ inviteId: invite.id }, { onSuccess: () => toast.success(t("cancelled")) });
                          }}
                        >
                          {t("cancel")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        action={
          <div className="flex flex-wrap gap-2">
            {data !== undefined && data.items.length > 0 && (
              <Button variant="outline" onClick={() => void copySheet(data.items)}>
                {t("copySheet")}
              </Button>
            )}
            <Button
              ref={addButton}
              onClick={() => {
                setAdding(true);
              }}
            >
              <PlusIcon aria-hidden="true" />
              {t("add")}
            </Button>
          </div>
        }
      />
      {data !== undefined && (
        <Figures
          label={t("figuresLabel")}
          figures={[
            { key: "sent", icon: SendIcon, value: formatCount(data.totals.sent), label: t("figures.sent") },
            { key: "opened", icon: MailOpenIcon, value: formatCount(data.totals.opened), label: t("figures.opened") },
            { key: "joined", icon: UserCheckIcon, value: formatCount(data.totals.joined), label: t("figures.joined") },
            { key: "opens", icon: EyeIcon, value: formatCount(data.totals.opens), label: t("figures.opens") },
          ]}
        />
      )}
      {content}
      <AddInvitesDialog open={adding} onOpenChange={setAdding} returnFocusTo={addButton} />
    </div>
  );
}
