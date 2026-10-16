// The payloads of crm's domain events (spec 4, ADR 0009): ids, never personal data, for later releases' listeners.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { leadStage } from "./fields.js";

/** lead.created. */
export const leadCreatedEvent = z.strictObject({ leadId: recordId, personId: recordId });
export type LeadCreatedEvent = z.infer<typeof leadCreatedEvent>;

/** lead.stage-changed, a reopen included. */
export const leadStageChangedEvent = z.strictObject({ leadId: recordId, from: leadStage, to: leadStage });
export type LeadStageChangedEvent = z.infer<typeof leadStageChangedEvent>;

/** lead.reassigned. */
export const leadReassignedEvent = z.strictObject({
  leadId: recordId,
  fromUserId: recordId.nullable(),
  toUserId: recordId.nullable(),
});
export type LeadReassignedEvent = z.infer<typeof leadReassignedEvent>;

/** lead.repeat-enquiry. */
export const leadRepeatEnquiryEvent = z.strictObject({ leadId: recordId, enquiryId: recordId });
export type LeadRepeatEnquiryEvent = z.infer<typeof leadRepeatEnquiryEvent>;

/** Any other change to a lead, such as lead.trip-edited. */
export const leadEvent = z.strictObject({ leadId: recordId });
export type LeadEvent = z.infer<typeof leadEvent>;

/** person.added and person.edited. */
export const personEvent = z.strictObject({ personId: recordId });
export type PersonEvent = z.infer<typeof personEvent>;

/** blocked-contact.added and blocked-contact.removed. */
export const blockedContactEvent = z.strictObject({ blockedContactId: recordId });
export type BlockedContactEvent = z.infer<typeof blockedContactEvent>;
