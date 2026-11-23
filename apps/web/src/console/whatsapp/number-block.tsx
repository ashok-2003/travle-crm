"use client";

// One of an organization's WhatsApp numbers on its console page (spec 2026-11-22 section 10), in a region named by its
// label and number (labels need not differ): the Main mark, status, mode and quality; once recorded, "Waiting for the
// first message", then "Webhook received" and Mark connected (off, with its reason, until the plan has the inbox and
// room for it and the first event arrived); Pause, Resume, Check with MSG91, Make main, Rename and Disconnect (asked once more, naming the number that
// becomes main); and its usage by month. Every action sends this number's id. Super admins change; support only looks.
import type { ConsoleNumber } from "@travel-crm/contracts/inbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Details } from "@/components/details";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDayTime, formatPhoneNumber } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { useConsoleTRPC } from "../data/console-trpc";
import { RenameNumberDialog } from "./rename-number-dialog";
import { connectionTones } from "./whatsapp-screen";

/**
 * The number that is main once `leaving` is disconnected, by the api's rule (mainConnection): among the other live
 * numbers, oldest first as listed after the main one, the first not still setting up, else the first.
 */
function nextMain(numbers: ConsoleNumber[], leaving: ConsoleNumber): ConsoleNumber | undefined {
  const others = numbers.filter((number) => number.id !== leaving.id);
  return others.find((number) => number.status !== "setup") ?? others[0];
}

export function NumberBlock({
  number,
  numbers,
  mayChange,
}: {
  number: ConsoleNumber;
  /** Every live number of the organization, the main one first: Disconnect names the next main from them. */
  numbers: ConsoleNumber[];
  mayChange: boolean;
}) {
  const t = useTranslations("consoleWhatsapp");
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const disconnectButton = useRef<HTMLButtonElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.whatsapp.pathKey() });
  const ids = { organizationId: number.organizationId, connectionId: number.id };
  const mark = useMutation(trpc.whatsapp.markConnected.mutationOptions({ onSuccess: refresh }));
  const pause = useMutation(trpc.whatsapp.pause.mutationOptions({ onSuccess: refresh }));
  const resume = useMutation(trpc.whatsapp.resume.mutationOptions({ onSuccess: refresh }));
  const makeMain = useMutation(trpc.whatsapp.setMain.mutationOptions({ onSuccess: refresh }));
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
  const failure = [mark, pause, resume, makeMain, check].find((request) => request.isError)?.error;
  const at = (instant: string) => formatDayTime(new Date(instant), { timeZone: PLATFORM_TIME_ZONE });
  const shown = formatPhoneNumber(number.displayNumber);
  const next = number.main ? nextMain(numbers, number) : undefined;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="font-semibold">
          {t("group.numberName", { label: number.label, number: shown })}
        </h3>
        {number.main && <Badge variant="outline">{t("group.main")}</Badge>}
      </div>
      <Details
        rows={[
          {
            label: t("columns.status"),
            value: (
              <StatusBadge tone={connectionTones[number.status] ?? "neutral"}>
                {t(`status.${number.status}`)}
              </StatusBadge>
            ),
          },
          { label: t("columns.mode"), value: t(`mode.${number.mode}`) },
          ...(number.qualityRating === null ? [] : [{ label: t("group.quality", { rating: number.qualityRating }) }]),
        ]}
      />
      {number.status === "setup" && (
        <p>
          {number.webhookSeenAt === null
            ? t("group.waiting", { number: shown })
            : t("group.received", { when: at(number.webhookSeenAt) })}
        </p>
      )}
      {number.cannotConnectReason !== null && number.status === "setup" && (
        <p className="text-muted-foreground">{t(`group.cannot.${number.cannotConnectReason}`)}</p>
      )}
      {number.cancelledButConnected && <p>{t("cancelled")}</p>}
      {mayChange && (
        <div className="flex flex-wrap gap-2">
          {number.status === "setup" && (
            <Button
              disabled={number.cannotConnectReason !== null || mark.isPending}
              onClick={() => {
                mark.mutate(ids);
              }}
            >
              {t("group.markConnected")}
            </Button>
          )}
          {number.status === "connected" && (
            <Button
              variant="outline"
              disabled={pause.isPending}
              onClick={() => {
                pause.mutate(ids);
              }}
            >
              {t("group.pause")}
            </Button>
          )}
          {number.status === "paused" && (
            <Button
              variant="outline"
              disabled={resume.isPending}
              onClick={() => {
                resume.mutate(ids);
              }}
            >
              {t("group.resume")}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={check.isPending}
            onClick={() => {
              check.mutate(ids);
            }}
          >
            {t("group.check")}
          </Button>
          {!number.main && (
            <Button
              variant="outline"
              disabled={makeMain.isPending}
              onClick={() => {
                makeMain.mutate(ids);
              }}
            >
              {t("group.makeMain")}
            </Button>
          )}
          <RenameNumberDialog number={number} />
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
        title={t("disconnectConfirm.title", { label: number.label })}
        description={
          <>
            {t("disconnectConfirm.description", { number: shown })}
            {next !== undefined && (
              <>
                {" "}
                {t("disconnectConfirm.mainMoves", { label: next.label, number: formatPhoneNumber(next.displayNumber) })}
              </>
            )}
          </>
        }
        action={t("disconnectConfirm.confirm")}
        request={disconnect}
        onConfirm={() => {
          disconnect.mutate(ids);
        }}
        returnFocusTo={disconnectButton}
      />
      {number.usage.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="font-semibold">{t("group.usage")}</h4>
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
              {number.usage.map((month) => (
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
    </section>
  );
}
