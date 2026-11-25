// The customer's open lead as the natural turn reads it live (spec 4.4 and 4.5): the name they go by and where it came
// from, the trip values on the lead, its stage, the chat's summary, the team's last notes and stage moves, its open tasks,
// and the values a person set, which the turn never changes. Who wrote each note is named after the transaction.
import type { NaturalFacts } from "@travel-crm/contracts/ai";
import { roomTypes } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { parseCalendarDate } from "../../kernel/index.js";
import { stageLabel } from "../lite/context/lead-card.js";
import { typedByPerson } from "../lite/prepare-lead.js";
import { usableNameOf } from "../lite/prepare.js";
import type { TypedFields } from "../lite/typed-lock.js";
import type { NaturalLeadView, OpenTaskView, TripSheet } from "./types.js";

const TEAM_NOTES = 3;
const OPEN_TASKS = 5;
const PROFILE_NAME = "WhatsApp profile name";

/** A team note or stage move, with the member who made it, named after the transaction. */
export interface TeamNoteRead {
  at: Date;
  userId: string;
  text: string;
}

export interface LeadRead {
  view: Omit<NaturalLeadView, "teamNotes">;
  notes: TeamNoteRead[];
  typed: TypedFields;
}

const dayOf = (at: Date) => parseCalendarDate(at.toISOString().slice(0, 10));

/**
 * The trip the lead is about. The lead keeps a place, not a trip: the one trip on sale there, else of those, the one the
 * chat dealt with last (the live offer, a total told, a brochure sent); else none, for the model to ask.
 */
export function leadTripOf(
  sheets: readonly TripSheet[],
  destinationId: string | null,
  facts: NaturalFacts,
): string | null {
  if (destinationId === null) return null;
  const there = sheets.filter((sheet) => sheet.destinationId === destinationId).map((sheet) => sheet.packageId);
  if (there.length <= 1) return there[0] ?? null;
  const told = facts.told.map((one) => one.packageId);
  const dealt = [facts.offer?.packageId, ...told.reverse(), ...[...facts.sentTripIds].reverse()];
  return dealt.find((id) => id !== undefined && there.includes(id)) ?? null;
}

/**
 * The team's last three notes and stage moves, newest first: a person's only. The AI's are in the chat and the lead
 * already, and the system's note on a lead it opened holds the customer's own first words, never the team's.
 */
async function teamNotesOf(tx: OrgTx, leadId: string): Promise<TeamNoteRead[]> {
  const notes = await tx.leadNote.findMany({
    where: { leadId, byAi: false, createdBy: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: TEAM_NOTES,
    select: { body: true, createdAt: true, createdBy: true },
  });
  const stages = await tx.leadTimelineEntry.findMany({
    where: { leadId, kind: "stage-changed", byAi: false, stage: { not: null }, actorUserId: { not: null } },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: TEAM_NOTES,
    select: { stage: true, occurredAt: true, actorUserId: true },
  });
  return [
    ...notes.map((note) => ({ at: note.createdAt, userId: note.createdBy ?? "", text: note.body })),
    ...stages.map((entry) => ({
      at: entry.occurredAt,
      userId: entry.actorUserId ?? "",
      text: `moved the lead to ${stageLabel(entry.stage ?? "")}`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, TEAM_NOTES);
}

/**
 * The lead's open tasks, soonest due first: what someone still has to do for the customer. The AI's own carry their kind
 * (act-task.ts makes a call-back a follow-up, a question a task), so it never opens a second one (open-task.ts).
 */
async function openTasksOf(tx: OrgTx, leadId: string): Promise<OpenTaskView[]> {
  const tasks = await tx.task.findMany({
    where: { recordType: "lead", recordId: leadId, doneAt: null, cancelledAt: null },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: OPEN_TASKS,
    select: { title: true, kind: true, byAi: true, createdAt: true },
  });
  return tasks
    .filter((task) => task.title.trim() !== "")
    .map((task) => ({
      text: task.title,
      aiKind: task.byAi ? (task.kind === "follow-up" ? "call_back" : "question") : null,
      createdAt: task.createdAt,
    }));
}

/** The lead (`leadId`, null when the customer has no open one) as the turn block shows it, with what a person set. */
export async function leadReadOf(
  tx: OrgTx,
  chat: { id: string; personId: string | null; profileName: string | null; phoneE164: string },
  leadId: string | null,
  context: { sheets: readonly TripSheet[]; facts: NaturalFacts; summary: string },
): Promise<LeadRead> {
  // K1: a WhatsApp stand-in or a word like "Travel" is no name.
  const name = await usableNameOf(tx, chat);
  const known = {
    name: name ?? "",
    cameFrom: name !== null && name === chat.profileName?.trim() ? PROFILE_NAME : "",
    summary: context.summary.trim() === "" ? null : context.summary,
  };
  const lead =
    leadId === null
      ? null
      : await tx.lead.findUnique({
          where: { id: leadId },
          select: {
            stage: true,
            destinationId: true,
            travelKind: true,
            travelStart: true,
            travelMonth: true,
            adults: true,
            childrenAges: true,
            departureCity: true,
            roomType: true,
          },
        });
  if (leadId === null || lead === null) {
    const view = { ...known, packageId: null, day: null, month: null, adults: null, childrenAges: [] };
    return { view: { ...view, pickupCity: null, room: null, stage: "new", openTasks: [] }, notes: [], typed: {} };
  }
  return {
    view: {
      ...known,
      packageId: leadTripOf(context.sheets, lead.destinationId, context.facts),
      day: lead.travelKind === "dates" && lead.travelStart !== null ? dayOf(lead.travelStart) : null,
      month:
        lead.travelKind === "month" && lead.travelMonth !== null ? lead.travelMonth.toISOString().slice(0, 7) : null,
      adults: lead.adults,
      childrenAges: lead.childrenAges,
      pickupCity: lead.departureCity,
      room: roomTypes.find((type) => type === lead.roomType) ?? null,
      stage: lead.stage,
      openTasks: await openTasksOf(tx, leadId),
    },
    notes: await teamNotesOf(tx, leadId),
    // With the place a person set: a trip elsewhere is theirs to weigh (action-tools' `theirPlaceId`).
    typed: await typedByPerson(tx, leadId, { place: true }),
  };
}
