"use client";

// A lead's sales signals on its page (sales execution; the lead page's revamp, 2026-11-21), in two places: how hot it
// is and why in its header (HotSignals), and its automatic follow-ups in its Follow-ups card (useAutomaticFollowUps):
// sent so far and when the next goes, or why they stopped, with Stop (they spoke on the phone; soft red, as it ends
// something) and Start again. Neither shows before the lead's sales have loaded.
import { FlameIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Detail } from "@/components/details";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useLeadSales, useSetFollowUps } from "./use-sales";

const stopReasons = ["replied", "closed", "by_hand", "opted_out", "cant_send", "finished", "turned_off"] as const;
const stopReasonOf = (reason: string | null) => stopReasons.find((known) => known === reason) ?? "by_hand";

/** "Hot lead" with a flame and why, as status badges; nothing for a lead that isn't hot. */
export function HotSignals({ leadId }: { leadId: string }) {
  const t = useTranslations("sales");
  const reasons = useLeadSales(leadId).data?.heat.reasons ?? [];
  if (reasons.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
        <FlameIcon aria-hidden="true" className="size-4 text-status-bad-ink" />
        {t("lead.hot")}
      </span>
      {reasons.map((reason) => (
        <StatusBadge key={reason} tone={reason === "quote_opened" || reason === "asked_price" ? "bad" : "attention"}>
          {t(`hot.reasons.${reason}`)}
        </StatusBadge>
      ))}
    </span>
  );
}

/**
 * The automatic follow-ups as a row of the Follow-ups card's details, with Start or Stop for whoever edits leads while
 * the lead is open; null where there is nothing to say (none on a closed lead) or before they load.
 */
export function useAutomaticFollowUps(leadId: string, open: boolean): Detail | null {
  const t = useTranslations("sales.lead");
  const timeZone = useMe().organization.timeZone;
  const sales = useLeadSales(leadId);
  const setFollowUps = useSetFollowUps();
  const mayEdit = useHolds("leads:edit");
  const access = useWriteAccess("change");
  const cadence = sales.data?.cadence;
  if (cadence === undefined || (cadence === null && !open)) return null;
  const words =
    cadence === null
      ? t("follow.none")
      : cadence.state === "active"
        ? t("follow.active", {
            sent: cadence.sent,
            steps: cadence.steps,
            next: cadence.nextAt === null ? "" : formatDayTime(new Date(cadence.nextAt), { timeZone }),
          })
        : t(`follow.${cadence.state === "done" ? "done" : "stopped"}`, {
            sent: cadence.sent,
            reason: t(`stopReasons.${stopReasonOf(cadence.stopReason)}`),
          });
  const running = cadence?.state === "active";
  return {
    label: t("follow.label"),
    value: (
      <div className="flex flex-col gap-2">
        {words}
        <RefusalAlert error={setFollowUps.error} />
      </div>
    ),
    ...(mayEdit &&
      open && {
        action: (
          <Button
            variant={running ? "destructive" : "outline"}
            disabled={setFollowUps.isPending || !access.allowed}
            onClick={() => {
              setFollowUps.mutate({ leadId, on: !running });
            }}
          >
            {running ? t("follow.stop") : t("follow.start")}
          </Button>
        ),
      }),
  };
}
