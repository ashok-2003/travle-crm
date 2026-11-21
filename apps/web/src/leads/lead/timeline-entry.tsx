"use client";

// One entry of a lead's timeline (spec 3.4, R36; the lead page's revamp, 2026-11-21) as one compact row, read by colour: a
// mark by kind, its title, who did it when a person did, and its time on the right (its day is the heading above it); a
// body only when there is one, a note's words cut to three lines with More. The marks (lookOf): what the AI did violet
// (and "AI" for screen readers), calls sky blue, the customer's chats and enquiries teal, stage moves their stage's own
// colour, follow-ups amber when set, green when done and grey when cancelled, bookings and payments green; the system's
// own entries (created, assigned, edited) grey and smaller, with no "The system". A name the page didn't carry is a
// former member's.
import type { PeopleNames, TimelineEntry } from "@travel-crm/contracts/crm";
import {
  ArrowRightIcon,
  CalendarClockIcon,
  CheckIcon,
  IndianRupeeIcon,
  MessageCircleIcon,
  PhoneIcon,
  SparklesIcon,
  StickyNoteIcon,
  TicketIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ClampedLines } from "@/components/clamped-lines";
import { statusToneClasses } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";
import { formatDayTime, formatTime } from "@/lib/format";
import { bookingRoute } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useMe } from "@/session/me-context";
import { CallEntryActions } from "../call/call-entry-actions";
import { stageTones } from "../stage-badge";
import { useTripLine } from "../trip-line";

type LookKind =
  "ai" | "call" | "chat" | "note" | "stage" | "set" | "done" | "cancelled" | "money" | "refused" | "system";

/** A mark's tint and ink, and its icon; the system's entries have none, only a small grey dot. */
interface Look {
  kind: LookKind;
  tone: string;
  icon: LucideIcon | null;
}

const looks: Record<Exclude<LookKind, "stage">, Omit<Look, "kind">> = {
  ai: { tone: "bg-people-tint text-people-tint-ink", icon: SparklesIcon },
  call: { tone: "bg-avatar-sky-fill text-avatar-sky-ink", icon: PhoneIcon },
  chat: { tone: "bg-stage-contacted-fill text-stage-contacted-ink", icon: MessageCircleIcon },
  note: { tone: "bg-muted text-foreground", icon: StickyNoteIcon },
  set: { tone: statusToneClasses.attention.badge, icon: CalendarClockIcon },
  done: { tone: statusToneClasses.good.badge, icon: CheckIcon },
  cancelled: { tone: statusToneClasses.neutral.badge, icon: XIcon },
  money: { tone: statusToneClasses.good.badge, icon: TicketIcon },
  refused: { tone: statusToneClasses.bad.badge, icon: IndianRupeeIcon },
  system: { tone: statusToneClasses.neutral.dot, icon: null },
};

const look = (kind: Exclude<LookKind, "stage">): Look => ({ kind, ...looks[kind] });

/** Whether the AI made the entry (its notes, stage moves and field changes): the AI filter's. */
export function byAi(entry: TimelineEntry): boolean {
  return entry.kind === "ai-field-set" || ((entry.kind === "note" || entry.kind === "stage-changed") && entry.byAi);
}

/** Whether the entry is a call or the customer writing on WhatsApp: the Calls & chats filter's. */
export function isCallOrChat(entry: TimelineEntry): boolean {
  return entry.kind === "call" || entry.kind === "whatsapp-contact";
}

/** The entry's look by its kind. */
export function lookOf(entry: TimelineEntry): Look {
  if (byAi(entry)) return look("ai");
  switch (entry.kind) {
    case "call":
      return look("call");
    case "whatsapp-contact":
    case "repeat-enquiry":
      return look("chat");
    case "note":
      return look("note");
    case "stage-changed":
      return { kind: "stage", tone: stageTones[entry.stage].badge, icon: ArrowRightIcon };
    case "follow-up-added":
      return look("set");
    case "follow-up-done":
      return look("done");
    case "follow-up-cancelled":
      return look("cancelled");
    case "booking-event":
      if (entry.event === "cancelled" || entry.event === "refunded") return look("cancelled");
      if (entry.event === "payment-rejected") return look("refused");
      return entry.event.startsWith("payment") ? { ...look("money"), icon: IndianRupeeIcon } : look("money");
    case "created":
    case "reassigned":
    case "trip-edited":
    case "ai-field-set":
      return look("system");
  }
}

const taskWords = {
  "follow-up-added": { "follow-up": "followUpAdded", task: "taskAdded" },
  "follow-up-done": { "follow-up": "followUpDone", task: "taskDone" },
  "follow-up-cancelled": { "follow-up": "followUpCancelled", task: "taskCancelled" },
} as const;

function Mark({ shown }: { shown: Look }) {
  if (shown.icon === null) {
    return (
      <span aria-hidden="true" data-mark={shown.kind} className="flex size-6 items-center justify-center">
        <span className={cn("size-1.5 rounded-full", shown.tone)} />
      </span>
    );
  }
  const Icon = shown.icon;
  return (
    <span
      aria-hidden="true"
      data-mark={shown.kind}
      className={cn("flex size-6 items-center justify-center rounded-full", shown.tone)}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

export function TimelineEntryItem({
  entry,
  people,
  leadId,
}: {
  entry: TimelineEntry;
  people: PeopleNames;
  leadId: string;
}) {
  const t = useTranslations("leads");
  const tripLine = useTripLine();
  const { timeZone } = useMe().organization;
  const at = (instant: string) => formatDayTime(new Date(instant), { timeZone });
  const nameOf = (userId: string) => people[userId] ?? t("formerMember");
  const lines = (...texts: (string | null)[]) =>
    texts
      .filter((text) => text !== null && text !== "")
      .map((text, index) => (
        // Two lines may read alike (a note that repeats the trip), so each is keyed by its entry and its place.
        <p key={`${entry.id}-${String(index)}`} className="whitespace-pre-line script-leading">
          {text}
        </p>
      ));

  // Who an automatic assignment chose and why (release 4); a person away is said so, for a manager to reassign.
  const assignmentLines = (assignment: Extract<TimelineEntry, { kind: "created" }>["assignment"] & object) => {
    if (assignment.ownerUserId === null) return lines(t("lead.timeline.assigned.none"));
    const name = nameOf(assignment.ownerUserId);
    const number = (assignment.rulePosition ?? 0) + 1;
    return lines(
      t(`lead.timeline.assigned.${assignment.reason}`, { name, number }),
      assignment.away ? t("lead.timeline.assigned.away", { name }) : null,
    );
  };

  const describe = (): { title: string; detail?: ReactNode; actions?: ReactNode } => {
    switch (entry.kind) {
      case "created":
        return {
          title: t(`lead.timeline.createdFrom.${entry.source}`),
          ...(entry.assignment && { detail: assignmentLines(entry.assignment) }),
        };
      case "note":
        return {
          title: entry.byAi ? t("lead.timeline.aiNote") : t("lead.timeline.note"),
          detail: <ClampedLines text={entry.body} />,
        };
      case "call":
        return {
          title: t("lead.timeline.call", { outcome: t(`call.note.outcomes.${entry.outcome}`) }),
          ...(entry.note !== null && entry.note !== "" && { detail: <ClampedLines text={entry.note} /> }),
          actions: (
            <CallEntryActions
              leadId={leadId}
              call={{
                callId: entry.callId,
                outcome: entry.outcome,
                note: entry.note,
                actorUserId: entry.actorUserId,
                occurredAt: entry.occurredAt,
              }}
            />
          ),
        };
      case "stage-changed":
        return { title: t("lead.timeline.moved", { stage: t(`stages.${entry.stage}`) }) };
      case "ai-field-set": {
        const field = t(`lead.timeline.aiFields.${entry.field}`);
        return {
          title:
            entry.from === null
              ? t("lead.timeline.aiSet", { field, to: entry.to })
              : t("lead.timeline.aiChanged", { field, from: entry.from, to: entry.to }),
        };
      }
      case "reassigned":
        return {
          title:
            entry.ownerUserId === null
              ? t("lead.timeline.unassigned")
              : t("lead.timeline.reassigned", { name: nameOf(entry.ownerUserId) }),
        };
      case "follow-up-added":
      case "follow-up-done":
      case "follow-up-cancelled": {
        const { task } = entry;
        const due = entry.kind === "follow-up-added" ? at(task.dueAt) : null;
        const what = due === null ? task.title : t("lead.timeline.taskDue", { title: task.title, due });
        return {
          title: t(`lead.timeline.${taskWords[entry.kind][task.kind]}`),
          detail: lines(task.title === "" && due !== null ? t("lead.timeline.due", { due }) : what),
        };
      }
      case "repeat-enquiry": {
        const { enquiry } = entry;
        const { trip } = enquiry;
        const summary = {
          destinationName: trip.destination?.name ?? null,
          when: trip.when,
          adults: trip.adults,
          childrenCount: trip.childrenAges.length,
        };
        const source = t(`sources.${enquiry.source}`);
        return {
          title: t("lead.timeline.repeatEnquiry"),
          detail: lines(
            tripLine(summary),
            enquiry.sourceDetail ? t("lead.timeline.sourceDetail", { source, detail: enquiry.sourceDetail }) : source,
            enquiry.note,
          ),
        };
      }
      case "trip-edited":
        return { title: t("lead.timeline.tripEdited") };
      case "whatsapp-contact":
        return { title: t("lead.timeline.whatsappContact") };
      case "booking-event":
        return {
          title: t(`lead.timeline.booking.${entry.event}`, { number: entry.number }),
          detail: (
            <TextLink inline href={bookingRoute(entry.bookingId)}>
              {t("lead.timeline.openBooking", { number: entry.number })}
            </TextLink>
          ),
        };
    }
  };

  const { title, detail, actions } = describe();
  const shown = lookOf(entry);
  const ai = shown.kind === "ai";
  const system = shown.kind === "system";
  // A person's name beside what they did; the AI's mark says it was the AI, and the system's entries need no name.
  const actor = !ai && entry.actorUserId !== null ? nameOf(entry.actorUserId) : null;
  return (
    <Item size="sm" role="listitem" data-kind={shown.kind} className="flex-nowrap items-start gap-3 px-0 py-1.5">
      <ItemMedia className="self-start">
        <Mark shown={shown} />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-1">
        <div className={cn("flex items-baseline gap-3", system && "text-caption text-muted-foreground")}>
          <div className="min-w-0 flex-1 script-leading">
            <h4 className={cn("inline", system ? "font-normal" : "font-medium")}>
              {/* The violet mark says it to the eye; this, to a screen reader. An AI note's title says it already. */}
              {ai && entry.kind !== "note" && (
                <>
                  <span className="sr-only">{t("lead.timeline.aiMark")}</span>{" "}
                </>
              )}
              {title}
            </h4>
            {actor !== null && <span className="text-muted-foreground"> · {actor}</span>}
          </div>
          <time dateTime={entry.occurredAt} className="numbers shrink-0 text-caption text-muted-foreground">
            {formatTime(new Date(entry.occurredAt), { timeZone })}
          </time>
        </div>
        {detail !== undefined && (
          <div className={cn("flex flex-col gap-1", system && "text-caption text-muted-foreground")}>{detail}</div>
        )}
        {actions}
      </ItemContent>
    </Item>
  );
}
