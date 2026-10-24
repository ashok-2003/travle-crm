"use client";

// /console/whatsapp (spec 3.5): every agency's WhatsApp number in a table (organization, number, mode, state, when it was
// connected, the last event, this month's messages, marketing against its cap), a banner when any number has stopped getting
// delivery reports, the numbers MSG91 sent events for that nobody recorded, and, for super admins, the webhook block.
import { useQuery } from "@tanstack/react-query";
import { MessageCircleIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDayTime, formatPhoneNumber } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { useConsoleTRPC } from "../data/console-trpc";
import { consoleRoutes } from "../routes";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { WebhookBlock } from "./webhook-block";

export const connectionTones: Record<string, StatusTone> = {
  connected: "good",
  setup: "neutral",
  paused: "attention",
  problem: "bad",
  disconnected: "neutral",
};

export function WhatsappScreen() {
  const t = useTranslations("consoleWhatsapp");
  const trpc = useConsoleTRPC();
  const staff = useStaff();
  const list = useQuery({ ...trpc.whatsapp.list.queryOptions(), refetchInterval: 30_000 });
  const at = (instant: string | null) =>
    instant === null ? t("never") : formatDayTime(new Date(instant), { timeZone: PLATFORM_TIME_ZONE });

  const body = () => {
    if (list.data === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={t("retry")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="table" columns={7} label={t("loading")} />
      );
    }
    const { items, unrouted, configured } = list.data;
    return (
      <div className="flex flex-col gap-8">
        {!configured && (
          <Alert>
            <AlertDescription>{t("notConfigured")}</AlertDescription>
          </Alert>
        )}
        {items.some((item) => item.status === "problem") && (
          <Alert variant="destructive">
            <AlertDescription>{t("problemBanner")}</AlertDescription>
          </Alert>
        )}
        {items.length === 0 ? (
          <EmptyState icon={MessageCircleIcon} message={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.agency")}</TableHead>
                <TableHead>{t("columns.number")}</TableHead>
                <TableHead>{t("columns.mode")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.connected")}</TableHead>
                <TableHead>{t("columns.lastEvent")}</TableHead>
                <TableHead>{t("columns.messages")}</TableHead>
                <TableHead>{t("columns.marketing")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="script-leading">
                    <Link className="underline" href={consoleRoutes.organization(item.organizationId)}>
                      {item.organizationName}
                    </Link>
                  </TableCell>
                  <TableCell className="numbers">{formatPhoneNumber(item.displayNumber)}</TableCell>
                  <TableCell>{t(`mode.${item.mode}`)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={connectionTones[item.status] ?? "neutral"}>
                      {t(`status.${item.status}`)}
                    </StatusBadge>
                    {item.overFairUse && <p className="text-caption">{t("overFairUse")}</p>}
                    {item.cancelledButConnected && <p className="text-caption">{t("cancelled")}</p>}
                  </TableCell>
                  <TableCell>{at(item.connectedAt)}</TableCell>
                  <TableCell>{at(item.lastEventAt)}</TableCell>
                  <TableCell className="numbers">
                    {t("messagesIn", {
                      inbound: item.messagesThisMonth.inbound,
                      outbound: item.messagesThisMonth.outbound,
                    })}
                  </TableCell>
                  <TableCell className="numbers">
                    {t("marketingOfCap", { used: item.messagesThisMonth.marketing, cap: item.marketingCapMonth })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {unrouted.length > 0 && (
          <section aria-labelledby="unrouted-heading" className="flex flex-col gap-2">
            <h2 id="unrouted-heading" className="text-section font-semibold">
              {t("unrouted.title")}
            </h2>
            <p className="text-muted-foreground">{t("unrouted.intro")}</p>
            <ul className="flex flex-col gap-1">
              {unrouted.map((row) => (
                <li key={row.integratedNumber} className="numbers">
                  {t("unrouted.row", {
                    number: formatPhoneNumber(`+${row.integratedNumber}`),
                    events: row.events,
                    last: at(row.lastSeenAt),
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}
        {isSuperAdmin(staff) && <WebhookBlock />}
      </div>
    );
  };

  return (
    <div className="flex max-w-[1200px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
