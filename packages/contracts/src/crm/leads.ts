// Adding leads, the known-contact check, and the list (spec 3.2, 3.3). A known contact's open lead is named by its
// destination and owner; its id only when the asker can see it (R24), so no client names a lead it can't see.
import { z } from "zod";
import { aiFillUse } from "../ai/fill-use.js";
import { recordId } from "../identity/fields.js";
import { taskKind } from "../tasks/tasks.js";
import {
  contactKind,
  handLeadSource,
  leadSource,
  leadStage,
  newPerson,
  noteBody,
  peopleNames,
  personContacts,
  shortText,
  tripType,
} from "./fields.js";
import { budget, tripInput, tripSummary } from "./trip.js";

export const createLeadInput = z.strictObject({
  person: newPerson,
  trip: tripInput,
  /** Becomes the lead's first timeline note. */
  note: noteBody.nullable(),
  source: handLeadSource,
  sourceDetail: shortText.nullable(),
  /** Null: whoever adds it. Anyone else needs leads:assign and must be able to work leads. */
  ownerUserId: recordId.nullable(),
  /**
   * What to do when the person has an open lead: add this as a repeat enquiry to it, or make a new lead. Null until
   * the form has asked; the server then answers OPEN_LEAD_EXISTS.
   */
  whenOpenLead: z.enum(["add-to-it", "new-lead"]).nullable(),
  /** Set when the form was filled by the AI ("Fill it for me"): the save is then audited as drafted by AI. */
  aiFill: aiFillUse.optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadInput>;

export const createdLead = z.object({
  outcome: z.enum(["created", "added-to-open-lead"]),
  /** Null when the enquiry went on a lead the person can't see. */
  leadId: recordId.nullable(),
  returning: z.boolean(),
});
export type CreatedLead = z.infer<typeof createdLead>;

export const knownContactInput = personContacts;
export type KnownContactInput = z.infer<typeof knownContactInput>;

export const knownContactResult = z.object({
  match: z
    .object({
      /** So the person editor can tell when the contact is the person being edited. */
      personId: recordId,
      personName: z.string(),
      matchedBy: contactKind,
      /** Their newest open lead: its id only when the asker can see it. */
      openLead: z
        .object({
          leadId: recordId.nullable(),
          destinationName: z.string().nullable(),
          ownerUserId: recordId.nullable(),
        })
        .nullable(),
    })
    .nullable(),
  /** Any contact given is on the blocked list. Saving still works (spec 4). */
  blocked: z.boolean(),
  people: peopleNames,
});
export type KnownContactResult = z.infer<typeof knownContactResult>;

export const listLeadsInput = z.strictObject({
  /** A salesperson always sees their own; "everyone" is for managers. */
  /** "unassigned" is the leads nobody owns (release C), for managers. */
  view: z.enum(["mine", "everyone", "unassigned"]).default("mine"),
  /** "open" is the four open stages. */
  stage: z.union([z.literal("open"), leadStage]).default("open"),
  ownerUserId: recordId.optional(),
  source: leadSource.optional(),
  destinationId: recordId.optional(),
  tripType: tripType.optional(),
  /** A name, forgiving of typos, or four or more digits of a phone. */
  search: z.string().trim().min(2).max(80).optional(),
  /** The last lead id of the previous page. */
  before: recordId.optional(),
  limit: z.int().min(1).max(50).default(25),
});
export type ListLeadsInput = z.infer<typeof listLeadsInput>;

/** What to do next about a lead: reply to a new one, or its earliest open follow-up or task. */
export const leadNextStep = z.object({
  /** Set while the lead is New: when it came in. */
  awaitingReplySince: z.iso.datetime().nullable(),
  task: z.object({ id: recordId, kind: taskKind, title: z.string(), dueAt: z.iso.datetime() }).nullable(),
});
export type LeadNextStep = z.infer<typeof leadNextStep>;

export const leadListItem = z.object({
  id: recordId,
  person: z.object({ name: z.string(), phone: z.string().nullable() }),
  returning: z.boolean(),
  stage: leadStage,
  trip: tripSummary,
  source: leadSource,
  ownerUserId: recordId.nullable(),
  budget: budget.nullable(),
  createdAt: z.iso.datetime(),
  next: leadNextStep,
});
export type LeadListItem = z.infer<typeof leadListItem>;

export const leadListPage = z.object({
  items: z.array(leadListItem),
  nextCursor: recordId.nullable(),
  people: peopleNames,
});
export type LeadListPage = z.infer<typeof leadListPage>;

export const leadCountsInput = listLeadsInput.omit({ stage: true, before: true, limit: true });
export type LeadCountsInput = z.infer<typeof leadCountsInput>;

/** Open leads by stage, for the quick filters. */
export const leadCounts = z.object({
  open: z.int(),
  new: z.int(),
  contacted: z.int(),
  quote_sent: z.int(),
  booking_requested: z.int(),
});
export type LeadCounts = z.infer<typeof leadCounts>;

/** Someone who can own leads, for the owner and assignee pickers: names only. */
export const leadWorker = z.object({ userId: recordId, name: z.string() });
export type LeadWorker = z.infer<typeof leadWorker>;
