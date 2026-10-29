"use client";

// One entry of a lead's timeline (spec 3.4, R36) as a sentence: the lead's creation and where it came from, a note
// (its words under it; the AI's own notes say so), a stage change, a reassignment, a follow-up or task added (what and when it is due), done or
// cancelled, a repeat enquiry (its trip, source and note) and a trip edit; then who did it and when, in the agency's
// zone. Nobody is "The system"; a name the page didn't carry is a former member's. A stage change carries its stage's
// dot and a finished follow-up or task status green's (DESIGN.md "Stage Colours", "Green Is Done"); nothing else is
// coloured.
import type { PeopleNames, TimelineEntry } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { StatusDot } from "@/components/status-badge";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { formatDayTime } from "@/lib/format";
import { useMe } from "@/session/me-context";
import { StageDot } from "../stage-badge";
import { useTripLine } from "../trip-line";

const taskWords = {
  "follow-up-added": { "follow-up": "followUpAdded", task: "taskAdded" },
  "follow-up-done": { "follow-up": "followUpDone", task: "taskDone" },
  "follow-up-cancelled": { "follow-up": "followUpCancelled", task: "taskCancelled" },
} as const;

export function TimelineEntryItem({ entry, people }: { entry: TimelineEntry; people: PeopleNames }) {
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

  // A dot that hangs in the margin before a title's first word, so every title starts at the same place.
  const inline = "-ms-3 me-1.5 inline-block align-middle";

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

  const describe = (): { title: string; detail?: ReactNode; mark?: ReactNode } => {
    switch (entry.kind) {
      case "created":
        return {
          title: t(`lead.timeline.createdFrom.${entry.source}`),
          ...(entry.assignment && { detail: assignmentLines(entry.assignment) }),
        };
      case "note":
        return { title: entry.byAi ? t("lead.timeline.aiNote") : t("lead.timeline.note"), detail: lines(entry.body) };
      case "stage-changed":
        return {
          title: t("lead.timeline.moved", { stage: t(`stages.${entry.stage}`) }),
          mark: <StageDot stage={entry.stage} className={inline} />,
        };
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
          ...(entry.kind === "follow-up-done" && { mark: <StatusDot tone="good" className={inline} /> }),
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
    }
  };

  const { title, detail, mark } = describe();
  const ai = entry.kind === "note" && entry.byAi;
  const actor = ai
    ? t("lead.timeline.ai")
    : entry.actorUserId === null
      ? t("lead.timeline.system")
      : nameOf(entry.actorUserId);
  return (
    <Item size="sm" role="listitem" className="px-0">
      <ItemContent>
        <ItemTitle>
          <h3>
            {mark}
            {title}
          </h3>
        </ItemTitle>
        <ItemDescription className="script-leading">
          {t("lead.timeline.meta", { actor, when: at(entry.occurredAt) })}
        </ItemDescription>
        {detail}
      </ItemContent>
    </Item>
  );
}
