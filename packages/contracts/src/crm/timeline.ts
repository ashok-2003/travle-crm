// A lead's timeline (spec 3.4): what happened to it, newest first, a page at a time.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { taskKind } from "../tasks/tasks.js";
import { assignedBy } from "./assignment.js";
import { leadSource, leadStage, peopleNames } from "./fields.js";
import { tripDetail } from "./trip.js";

export const leadEventKinds = [
  "created",
  "note",
  "stage-changed",
  "reassigned",
  "follow-up-added",
  "follow-up-done",
  "follow-up-cancelled",
  "repeat-enquiry",
  "trip-edited",
  /** The thread restarted on WhatsApp after a quiet day (the chat is the person's, so no enquiry per message). */
  "whatsapp-contact",
] as const;
export const leadEventKind = z.enum(leadEventKinds);
export type LeadEventKind = z.infer<typeof leadEventKind>;

export const timelineInput = z.strictObject({
  leadId: recordId,
  /** The last entry id of the previous page. */
  before: recordId.optional(),
  limit: z.int().min(1).max(50).default(20),
});
export type TimelineInput = z.infer<typeof timelineInput>;

const entry = { id: recordId, occurredAt: z.iso.datetime(), actorUserId: recordId.nullable() };
const timelineTask = z.object({ kind: taskKind, title: z.string(), dueAt: z.iso.datetime() });

export const timelineEntry = z.discriminatedUnion("kind", [
  z.object({
    ...entry,
    kind: z.literal("created"),
    source: leadSource,
    /** Who the lead went to and why, when the agency's assignment chose (spec 4.7); null for a lead added by hand. */
    assignment: assignedBy.extend({ ownerUserId: recordId.nullable() }).nullable(),
  }),
  /** byAi: written by the AI agent from the lead's chat. */
  z.object({ ...entry, kind: z.literal("note"), body: z.string(), byAi: z.boolean() }),
  z.object({ ...entry, kind: z.literal("stage-changed"), stage: leadStage }),
  z.object({ ...entry, kind: z.literal("reassigned"), ownerUserId: recordId.nullable() }),
  z.object({ ...entry, kind: z.literal("follow-up-added"), task: timelineTask }),
  z.object({ ...entry, kind: z.literal("follow-up-done"), task: timelineTask }),
  z.object({ ...entry, kind: z.literal("follow-up-cancelled"), task: timelineTask }),
  z.object({
    ...entry,
    kind: z.literal("repeat-enquiry"),
    enquiry: z.object({
      source: leadSource,
      sourceDetail: z.string().nullable(),
      note: z.string().nullable(),
      trip: tripDetail,
    }),
  }),
  z.object({ ...entry, kind: z.literal("trip-edited") }),
  z.object({ ...entry, kind: z.literal("whatsapp-contact") }),
]);
export type TimelineEntry = z.infer<typeof timelineEntry>;

export const timelinePage = z.object({
  entries: z.array(timelineEntry),
  nextCursor: recordId.nullable(),
  people: peopleNames,
});
export type TimelinePage = z.infer<typeof timelinePage>;
