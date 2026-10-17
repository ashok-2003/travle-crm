// A lead's page and the changes made from it (spec 3.4): the stage, the owner, the trip, the person, notes, and
// follow-ups and tasks on it.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { wallClockTime } from "../kernel/time.js";
import { task, taskKind, taskTitle } from "../tasks/tasks.js";
import { leadSource, leadStage, newPerson, noteBody, openLeadStage, peopleNames } from "./fields.js";
import { tripDetail, tripInput } from "./trip.js";

export const leadIdInput = z.strictObject({ leadId: recordId });
export type LeadIdInput = z.infer<typeof leadIdInput>;

/** An open follow-up or task on the lead, as TaskActions takes it. */
export const leadWork = task.pick({ id: true, kind: true, title: true, dueAt: true, assigneeUserId: true });
export type LeadWork = z.infer<typeof leadWork>;

export const leadDetail = z.object({
  id: recordId,
  stage: leadStage,
  /** Where Reopen returns a closed lead; null means New. */
  reopenStage: openLeadStage.nullable(),
  stageChangedAt: z.iso.datetime(),
  firstReplyAt: z.iso.datetime().nullable(),
  returning: z.boolean(),
  person: z.object({
    id: recordId,
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    instagramHandle: z.string().nullable(),
  }),
  trip: tripDetail,
  source: leadSource,
  sourceDetail: z.string().nullable(),
  ownerUserId: recordId.nullable(),
  createdBy: recordId.nullable(),
  createdAt: z.iso.datetime(),
  /** Every open follow-up and task on the lead, earliest due first. */
  work: z.array(leadWork),
  people: peopleNames,
});
export type LeadDetail = z.infer<typeof leadDetail>;

export const moveStageInput = z.strictObject({ leadId: recordId, stage: leadStage });
export type MoveStageInput = z.infer<typeof moveStageInput>;

export const reassignLeadInput = z.strictObject({ leadId: recordId, ownerUserId: recordId });
export type ReassignLeadInput = z.infer<typeof reassignLeadInput>;

/** The whole trip, replaced. */
export const editTripInput = z.strictObject({ leadId: recordId, trip: tripInput });
export type EditTripInput = z.infer<typeof editTripInput>;

/** The lead's person: their name and contacts, replaced. */
export const editPersonInput = z.strictObject({ leadId: recordId, person: newPerson });
export type EditPersonInput = z.infer<typeof editPersonInput>;

export const addNoteInput = z.strictObject({ leadId: recordId, body: noteBody });
export type AddNoteInput = z.infer<typeof addNoteInput>;

/** A follow-up or a task on the lead, given to its owner, due on the agency's clock. */
export const addLeadWorkInput = z.strictObject({
  leadId: recordId,
  kind: taskKind,
  title: taskTitle,
  due: wallClockTime,
});
export type AddLeadWorkInput = z.infer<typeof addLeadWorkInput>;
