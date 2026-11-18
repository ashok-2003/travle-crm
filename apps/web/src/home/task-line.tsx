"use client";

// One thing to do on Home: who (or a task's title), what, and its urgency ("Overdue", "12 min ago", "4:00 pm"), the
// whole line a way to the lead (or the departure).
import type { TodayItem } from "@travel-crm/contracts/today";
import { money } from "@travel-crm/domain/kernel";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { formatCalendarDay, formatRupees, formatTime } from "@/lib/format";
import { elapsed } from "@/lib/relative-time";
import { departureRoute, leadRoute, routes } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { useMe } from "@/session/me-context";
import { cn } from "@/lib/utils";
import { rowClasses } from "./home-card";
import { WhenMark, type Urgency } from "@/today/when-mark";

export function TaskLine({ item }: { item: TodayItem }) {
  const t = useTranslations("home.tasks");
  const tNext = useTranslations("leads.next");
  const { timeZone } = useMe().organization;
  const now = useNow();
  const when = ((): { urgency: Urgency; text: string } => {
    if (item.kind === "new-lead") {
      const { unit, count } = elapsed(new Date(item.waitingSince), now);
      return { urgency: "waiting", text: t("ago", { elapsed: tNext(`elapsed.${unit}`, { count }) }) };
    }
    if (item.kind === "quote-opened") return { urgency: "waiting", text: t("quoteOpened") };
    if (item.kind === "trip-details" || item.kind === "departure") {
      return { urgency: "waiting", text: formatCalendarDay(item.startDate, now) };
    }
    if (item.kind === "payment-due") {
      return {
        urgency: item.missed ? "overdue" : "today",
        text: item.missed ? t("paymentMissed") : formatCalendarDay(item.dueOn, now),
      };
    }
    const due = new Date(item.task.dueAt);
    return due < now
      ? { urgency: "overdue", text: t("overdue") }
      : { urgency: "today", text: formatTime(due, { timeZone }) };
  })();
  const title =
    item.kind === "departure" ? item.title : (item.lead?.personName ?? (item.kind === "task" ? item.task.title : ""));
  const about = ((): string | null => {
    if (item.kind === "new-lead") return t("waiting");
    if (item.kind === "quote-opened") return item.quote.title;
    if (item.kind === "payment-due") return formatRupees(money(item.amountPaise));
    if (item.kind === "trip-details") return t("tripDetails");
    if (item.kind === "departure") return t("departure");
    return item.lead === null ? null : item.task.title;
  })();
  const href =
    item.kind === "departure"
      ? departureRoute(item.departureId)
      : item.lead === null
        ? routes.today
        : leadRoute(item.lead.id);
  return (
    <Item size="sm" asChild className={rowClasses.item}>
      <Link href={href}>
        <ItemContent className={rowClasses.content}>
          <ItemTitle className="script-leading shrink-0">{title}</ItemTitle>
          {about !== null && (
            <ItemDescription className={cn(rowClasses.about, "script-leading")}>{about}</ItemDescription>
          )}
        </ItemContent>
        <WhenMark urgency={when.urgency}>{when.text}</WhenMark>
      </Link>
    </Item>
  );
}
