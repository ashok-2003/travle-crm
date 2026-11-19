"use client";

// When a thing on My tasks is due, as its tab's Due, Waiting or Leaves column words it, and the urgency that colours it
// (WhenMark): "Yesterday, 5:00 pm" overdue, "12 min" a new lead waiting, "4:00 pm" later today, a payment's day (red
// once missed) or the day a trip leaves. Times are the agency's.
import type { TodayItem } from "@travel-crm/contracts/today";
import { useTranslations } from "next-intl";
import { formatCalendarDay, formatDayTime, formatTime } from "@/lib/format";
import { dayRelation, elapsed } from "@/lib/relative-time";
import { useNow } from "@/lib/use-now";
import { useMe } from "@/session/me-context";
import type { Urgency } from "./when-mark";

export function useItemWhen(): (item: TodayItem) => { urgency: Urgency; text: string } {
  const t = useTranslations("today.item");
  const tNext = useTranslations("leads.next");
  const { timeZone } = useMe().organization;
  const now = useNow();
  return (item) => {
    switch (item.kind) {
      case "new-lead":
      case "quote-opened": {
        const { unit, count } = elapsed(
          new Date(item.kind === "new-lead" ? item.waitingSince : item.lastOpenedAt),
          now,
        );
        return { urgency: "waiting", text: tNext(`elapsed.${unit}`, { count }) };
      }
      case "trip-details":
      case "departure":
        return { urgency: "today", text: formatCalendarDay(item.startDate, now) };
      case "payment-due":
        return { urgency: item.missed ? "overdue" : "today", text: formatCalendarDay(item.dueOn, now) };
      case "task": {
        const due = new Date(item.task.dueAt);
        const clock = { timeZone, now };
        const relation = dayRelation(due, clock);
        const time = formatTime(due, clock);
        if (due >= now) return { urgency: "today", text: relation === "today" ? time : formatDayTime(due, clock) };
        if (relation === "yesterday") return { urgency: "overdue", text: t("yesterday", { time }) };
        return { urgency: "overdue", text: relation === "today" ? t("today", { time }) : formatDayTime(due, clock) };
      }
    }
  };
}
