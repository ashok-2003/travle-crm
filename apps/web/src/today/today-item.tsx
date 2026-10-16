"use client";

// One thing on Today (spec 3.5, the mockup): the person it is about, leading to their lead (a task on no lead shows its
// title), when it is due in its urgency's colour, what to do and the trip in a line, then two rows of buttons, since
// four 44px buttons don't fit one row on a phone: how to reach them (Call and WhatsApp, both outline, when they have a
// phone), then how to close it (Done and Snooze), or Mark contacted for a new lead. Times are the agency's.
import type { TripSummary } from "@travel-crm/contracts/crm";
import type { TodayItem as TodayItemData } from "@travel-crm/contracts/today";
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { CallButton, WhatsAppButton } from "@/leads/contact-buttons";
import { useTripLine } from "@/leads/trip-line";
import { formatDayTime, formatTime } from "@/lib/format";
import { dayRelation, elapsed } from "@/lib/relative-time";
import { leadRoute } from "@/lib/routes";
import { useNow } from "@/lib/use-now";
import { useHolds, useMe } from "@/session/me-context";
import { TaskActions } from "@/tasks/task-actions";
import { MarkContactedButton } from "./mark-contacted-button";
import { WhenMark, type Urgency } from "./when-mark";

/** The id a section's page names it by: its task's, or a new lead's. */
export function todayItemId(item: TodayItemData): string {
  return item.kind === "task" ? item.task.id : item.lead.id;
}

const tripKnown = (trip: TripSummary) =>
  trip.destinationName !== null || trip.when.kind !== "unknown" || trip.adults !== null || trip.childrenCount > 0;

/** When it is due, as Today words it: "Yesterday, 5:00 pm" overdue, "12 min" waiting, "4:00 pm" later today. */
function useWhen(item: TodayItemData): { urgency: Urgency; text: string } {
  const t = useTranslations("today.item");
  const tNext = useTranslations("leads.next");
  const { timeZone } = useMe().organization;
  const now = useNow();
  if (item.kind === "new-lead") {
    const { unit, count } = elapsed(new Date(item.waitingSince), now);
    return { urgency: "waiting", text: tNext(`elapsed.${unit}`, { count }) };
  }
  const due = new Date(item.task.dueAt);
  const clock = { timeZone, now };
  const relation = dayRelation(due, clock);
  const time = formatTime(due, clock);
  if (due >= now) return { urgency: "today", text: relation === "today" ? time : formatDayTime(due, clock) };
  const text =
    relation === "yesterday"
      ? t("yesterday", { time })
      : relation === "today"
        ? t("today", { time })
        : formatDayTime(due, clock);
  return { urgency: "overdue", text };
}

export function TodayItem({ item }: { item: TodayItemData }) {
  const tSources = useTranslations("leads.sources");
  const tripLine = useTripLine();
  const mayEdit = useHolds("leads:edit");
  const when = useWhen(item);
  const { lead } = item;
  const title = item.kind === "task" ? item.task.title : null;
  const phone = lead?.phone ?? null;
  const trip = lead && tripKnown(lead.trip) ? tripLine(lead.trip) : null;
  // A task on no lead already shows its title as the item's title.
  const about = item.kind === "new-lead" ? [trip, tSources(item.lead.source)] : lead ? [title, trip] : [];
  const description = about.filter((part): part is string => part !== null && part !== "").join(" · ");
  return (
    <Item size="sm" role="listitem" className="items-start">
      <ItemContent className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          {lead ? (
            <TextLink href={leadRoute(lead.id)}>{lead.personName}</TextLink>
          ) : (
            <ItemTitle className="min-h-11 script-leading">{title}</ItemTitle>
          )}
          <WhenMark urgency={when.urgency}>{when.text}</WhenMark>
        </div>
        {description !== "" && <ItemDescription className="break-words script-leading">{description}</ItemDescription>}
      </ItemContent>
      <ItemActions className="basis-full flex-col items-start gap-2">
        {lead !== null && phone !== null && (
          <div className="flex flex-wrap gap-2">
            <CallButton phone={phone} name={lead.personName} variant="outline" />
            <WhatsAppButton phone={phone} name={lead.personName} />
          </div>
        )}
        {item.kind === "task" ? <TaskActions task={item.task} /> : mayEdit && <MarkContactedButton lead={item.lead} />}
      </ItemActions>
    </Item>
  );
}
