"use client";

// A lead's sales signals on its page (sales execution): how hot it is and why, and its automatic follow-ups (sent so
// far, when the next goes, or why they stopped), with Stop (they spoke on the phone) and Start again. Nothing shows for a
// lead that is neither hot nor followed up.
import { FlameIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/format";
import { LeadCard } from "@/leads/lead/lead-card";
import { useHolds, useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { useLeadSales, useSetFollowUps } from "./use-sales";

const stopReasons = ["replied", "closed", "by_hand", "opted_out", "cant_send", "finished", "turned_off"] as const;
const stopReasonOf = (reason: string | null) => stopReasons.find((known) => known === reason) ?? "by_hand";

export function LeadSalesCard({ leadId, open }: { leadId: string; open: boolean }) {
  const t = useTranslations("sales.lead");
  const tHot = useTranslations("sales.hot");
  const timeZone = useMe().organization.timeZone;
  const sales = useLeadSales(leadId);
  const setFollowUps = useSetFollowUps();
  const mayEdit = useHolds("leads:edit");
  const access = useWriteAccess("change");
  const data = sales.data;
  if (data === undefined || (data.heat.reasons.length === 0 && data.cadence === null && !open)) return null;
  const cadence = data.cadence;
  const followWords =
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
  return (
    <LeadCard title={t("title")}>
      {data.heat.reasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <FlameIcon aria-hidden="true" className="size-5 text-status-bad-ink" />
          <span className="font-semibold">{t("hot")}</span>
          {data.heat.reasons.map((reason) => (
            <StatusBadge
              key={reason}
              tone={reason === "quote_opened" || reason === "asked_price" ? "bad" : "attention"}
            >
              {tHot(`reasons.${reason}`)}
            </StatusBadge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">{followWords}</p>
        {mayEdit && open && (
          <Button
            variant="outline"
            disabled={setFollowUps.isPending || !access.allowed}
            onClick={() => {
              setFollowUps.mutate({ leadId, on: cadence?.state !== "active" });
            }}
          >
            {cadence?.state === "active" ? t("follow.stop") : t("follow.start")}
          </Button>
        )}
      </div>
      <RefusalAlert error={setFollowUps.error} />
    </LeadCard>
  );
}
