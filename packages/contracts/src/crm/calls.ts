// Calls on a lead (release 5): the call panel's "Send to my phone", and a call written up with one line about how it
// went and, if wanted, the next follow-up. A call's note is never copied into the audit log or an event.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { wallClockTime } from "../kernel/time.js";
import { taskTitle } from "../tasks/tasks.js";

export const callOutcomes = ["spoke", "no_answer", "busy", "wrong_number"] as const;
export const callOutcome = z.enum(callOutcomes);
export type CallOutcome = z.infer<typeof callOutcome>;

/** How long after a call its writer may still change or delete it; after that, a manager (leads:assign). */
export const CALL_EDIT_HOURS = 24;

/** The note on a call: a few lines at most. */
export const callNote = z.string().trim().min(1, "Write a line or leave it empty").max(2000);

/** The next follow-up a call asks for: when, and what to call it (the words "Call back" when none are given). */
export const callFollowUp = z.strictObject({ due: wallClockTime, title: taskTitle.optional() });
export type CallFollowUp = z.infer<typeof callFollowUp>;

export const logCallInput = z.strictObject({
  leadId: recordId,
  outcome: callOutcome,
  note: callNote.optional(),
  followUp: callFollowUp.optional(),
});
export type LogCallInput = z.infer<typeof logCallInput>;

export const callLogged = z.object({ callId: recordId });

export const editCallInput = z.strictObject({ callId: recordId, outcome: callOutcome, note: callNote.nullable() });
export type EditCallInput = z.infer<typeof editCallInput>;

export const callIdInput = z.strictObject({ callId: recordId });
export type CallIdInput = z.infer<typeof callIdInput>;

export const sendToMyPhoneInput = z.strictObject({ leadId: recordId });
export type SendToMyPhoneInput = z.infer<typeof sendToMyPhoneInput>;

/** Who to call on the page a "Send to my phone" push opens: the name and the number, for a lead the person may see. */
export const callTarget = z.object({ leadId: recordId, name: z.string(), phone: z.string().nullable() });
export type CallTarget = z.infer<typeof callTarget>;

/** The notification kind of "Send to my phone". */
export const CALL_DIAL_KIND = "call.dial";
