"use client";

// An organization's WhatsApp group on its console page (spec 3.5): the number, or Connect a number; once recorded, "Waiting
// for the first message", then "Webhook received" and Mark connected (off, with its reason, until the plan has the inbox and
// a number and the first event arrived); Pause, Resume and Disconnect (asked once more); Check with MSG91; and the month's
// usage. Super admins change; support only looks. Changes load the group again.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Details } from "@/components/details";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDayTime, formatPhoneNumber } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { toast } from "sonner";
import { useConsoleTRPC } from "../data/console-trpc";
import { DetailSection } from "../organizations/organization/detail-list";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { ConnectDialog } from "./connect-dialog";
import { connectionTones } from "./whatsapp-screen";

export function OrganizationWhatsapp({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const t = useTranslations("consoleWhatsapp");
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const staff = useStaff();
  const mayChange = isSuperAdmin(staff);
  const group = useQuery({ ...trpc.whatsapp.get.queryOptions({ organizationId }), refetchInterval: 20_000 });
  const [confirming, setConfirming] = useState(false);
  const disconnectButton = useRef<HTMLButtonElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.whatsapp.pathKey() });
  const mark = useMutation(trpc.whatsapp.markConnected.mutationOptions({ onSuccess: refresh }));
  const pause = useMutation(trpc.whatsapp.pause.mutationOptions({ onSuccess: refresh }));
  const resume = useMutation(trpc.whatsapp.resume.mutationOptions({ onSuccess: refresh }));
  const check = useMutation(
    trpc.whatsapp.checkWithProvider.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        if (result.answered) toast.success(t("group.checkAnswered"));
        else toast.error(t("group.checkFailed"));
      },
    }),
  );
  const disconnect = useMutation(
    trpc.whatsapp.disconnect.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setConfirming(false);
      },
    }),
  );

  if (group.data === undefined) {
    return (
      <DetailSection id="whatsapp-heading" heading={t("group.title")}>
        {group.isError ? (
          <ErrorState
            message={t("group.loadFailed")}
            error={group.error}
            retryLabel={t("retry")}
            onRetry={() => void group.refetch()}
          />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )}
      </DetailSection>
    );
  }
  const { connection, usage, cannotConnectReason, configured } = group.data;
  const failure = [mark, pause, resume, check, disconnect].find((request) => request.isError)?.error;
  const at = (instant: string) => formatDayTime(new Date(instant), { timeZone: PLATFORM_TIME_ZONE });

  return (
    <DetailSection id="whatsapp-heading" heading={t("group.title")}>
      {!configured && <p className="text-muted-foreground">{t("group.notConfigured")}</p>}
      {connection === null ? (
        <>
          <p className="text-muted-foreground">{t("group.none")}</p>
          {mayChange && <ConnectDialog organizationId={organizationId} />}
        </>
      ) : (
        <>
          <Details
            rows={[
              {
                label: t("columns.number"),
                value: <span className="numbers">{formatPhoneNumber(connection.displayNumber)}</span>,
              },
              {
                label: t("columns.status"),
                value: (
                  <StatusBadge tone={connectionTones[connection.status] ?? "neutral"}>
                    {t(`status.${connection.status}`)}
                  </StatusBadge>
                ),
              },
              { label: t("columns.mode"), value: t(`mode.${connection.mode}`) },
              ...(connection.qualityRating === null
                ? []
                : [{ label: t("group.quality", { rating: connection.qualityRating }) }]),
            ]}
          />
          {connection.status === "setup" && (
            <p>
              {connection.webhookSeenAt === null
                ? t("group.waiting", { number: formatPhoneNumber(connection.displayNumber) })
                : t("group.received", { when: at(connection.webhookSeenAt) })}
            </p>
          )}
          {cannotConnectReason !== null && connection.status === "setup" && (
            <p className="text-muted-foreground">{t(`group.cannot.${cannotConnectReason}`)}</p>
          )}
          {connection.cancelledButConnected && <p>{t("cancelled")}</p>}
          {mayChange && (
            <div className="flex flex-wrap gap-2">
              {connection.status === "setup" && (
                <Button
                  disabled={cannotConnectReason !== null || mark.isPending}
                  onClick={() => {
                    mark.mutate({ organizationId });
                  }}
                >
                  {t("group.markConnected")}
                </Button>
              )}
              {connection.status === "connected" && (
                <Button
                  variant="outline"
                  disabled={pause.isPending}
                  onClick={() => {
                    pause.mutate({ organizationId });
                  }}
                >
                  {t("group.pause")}
                </Button>
              )}
              {connection.status === "paused" && (
                <Button
                  variant="outline"
                  disabled={resume.isPending}
                  onClick={() => {
                    resume.mutate({ organizationId });
                  }}
                >
                  {t("group.resume")}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={check.isPending}
                onClick={() => {
                  check.mutate({ organizationId });
                }}
              >
                {t("group.check")}
              </Button>
              <Button
                ref={disconnectButton}
                variant="destructive"
                onClick={() => {
                  setConfirming(true);
                }}
              >
                {t("group.disconnect")}
              </Button>
            </div>
          )}
          {failure !== undefined && <RefusalAlert error={failure} />}
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t("disconnectConfirm.title", { agency: organizationName })}
            description={t("disconnectConfirm.description")}
            action={t("disconnectConfirm.confirm")}
            request={disconnect}
            onConfirm={() => {
              disconnect.mutate({ organizationId });
            }}
            returnFocusTo={disconnectButton}
          />
          {usage.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold">{t("group.usage")}</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("group.usageMonth")}</TableHead>
                    <TableHead>{t("group.usageIn")}</TableHead>
                    <TableHead>{t("group.usageReplies")}</TableHead>
                    <TableHead>{t("group.usageUtility")}</TableHead>
                    <TableHead>{t("group.usageMarketing")}</TableHead>
                    <TableHead>{t("group.usageFailed")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.map((month) => (
                    <TableRow key={month.month}>
                      <TableCell className="numbers">{month.month}</TableCell>
                      <TableCell className="numbers">{month.inbound}</TableCell>
                      <TableCell className="numbers">{month.replies}</TableCell>
                      <TableCell className="numbers">{month.utility}</TableCell>
                      <TableCell className="numbers">{month.marketing}</TableCell>
                      <TableCell className="numbers">{month.failed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </DetailSection>
  );
}
