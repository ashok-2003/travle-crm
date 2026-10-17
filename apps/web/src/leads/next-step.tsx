"use client";

// What's next about a lead (R43), in one line whose colour carries the urgency: an overdue task in red, then a new lead
// still waiting for a reply in amber, each a status with its dot before the words (DESIGN.md: Dot Plus Word); then the
// next task in violet when it is due today, and quiet grey when it is later or there is none. Days and times are the
// agency's (its zone), however the device is set.
import type { LeadNextStep } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { StatusDot, type StatusTone } from "@/components/status-badge";
import { formatDay, formatDayTime, formatTime } from "@/lib/format";
import { dayRelation, elapsed } from "@/lib/relative-time";
import { useNow } from "@/lib/use-now";

export type Tone = "overdue" | "waiting" | "today" | "quiet";

/** Each tone's ink, and the status of the two that are one (shown by its dot): Today's WhenMark shares them. */
export const tones: Record<Tone, { ink: string; status: StatusTone | null }> = {
  overdue: { ink: "text-status-bad-ink", status: "bad" },
  waiting: { ink: "text-status-attention-ink", status: "attention" },
  today: { ink: "text-people-tint-ink", status: null },
  quiet: { ink: "text-muted-foreground", status: null },
};

export function NextStep({ next, timeZone }: { next: LeadNextStep; timeZone: string }) {
  const t = useTranslations("leads.next");
  const now = useNow();
  const clock = { timeZone, now };
  const describe = (): { tone: Tone; text: string } => {
    const due = next.task && new Date(next.task.dueAt);
    const isFollowUp = next.task?.kind === "follow-up";
    if (due && due < now) {
      const relation = dayRelation(due, clock);
      const time = formatTime(due, clock);
      const when =
        relation === "yesterday"
          ? t("yesterday", { time })
          : relation === "today"
            ? t("today", { time })
            : formatDayTime(due, clock);
      return { tone: "overdue", text: t(isFollowUp ? "followUpOverdue" : "taskOverdue", { when }) };
    }
    if (next.awaitingReplySince !== null) {
      const { unit, count } = elapsed(new Date(next.awaitingReplySince), now);
      return { tone: "waiting", text: t("waiting", { elapsed: t(`elapsed.${unit}`, { count }) }) };
    }
    if (!due) return { tone: "quiet", text: t("none") };
    const relation = dayRelation(due, clock);
    const time = formatTime(due, clock);
    if (relation === "today") return { tone: "today", text: t(isFollowUp ? "followUpToday" : "taskToday", { time }) };
    if (relation === "tomorrow") {
      return { tone: "quiet", text: t(isFollowUp ? "followUpTomorrow" : "taskTomorrow", { time }) };
    }
    return { tone: "quiet", text: t(isFollowUp ? "followUpLater" : "taskLater", { day: formatDay(due, clock) }) };
  };
  const { tone, text } = describe();
  const { ink, status } = tones[tone];
  return (
    <span className={ink}>
      {status && <StatusDot tone={status} className="me-1.5 inline-block align-middle" />}
      {text}
    </span>
  );
}
