// The Follow-ups screen (the owner, 2026-10-30): every open follow-up on a lead, with the lead's last WhatsApp message
// (when, from whom, what) and whether its 24-hour window is open, and what the AI did when the follow-up came due.
import { z } from "zod";
import { leadStage, peopleNames } from "../crm/fields.js";
import { recordId } from "../identity/fields.js";

export const followUpViews = ["due", "upcoming", "all"] as const;
export const followUpsInput = z.strictObject({
  /** Due now (overdue and today), later, or every open one. */
  view: z.enum(followUpViews),
  /** Only the member's own, or everyone's (with leads:view over all leads). */
  mine: z.boolean(),
});
export type FollowUpsInput = z.infer<typeof followUpsInput>;

/** What the AI did when a follow-up came due: wrote to the customer, or why it could not. */
export const followUpTouchOutcomes = ["sent", "window_closed", "no_chat", "opted_out", "off", "failed"] as const;
export type FollowUpTouchOutcome = (typeof followUpTouchOutcomes)[number];

export const followUpRow = z.object({
  taskId: recordId,
  title: z.string(),
  dueAt: z.iso.datetime(),
  assigneeUserId: recordId.nullable(),
  /** Added by the AI from a chat, not by a person. */
  byAi: z.boolean(),
  lead: z.object({ id: recordId, name: z.string(), stage: leadStage, phone: z.string().nullable() }),
  /** The lead's WhatsApp chat, if there is one. */
  whatsapp: z
    .object({
      conversationId: recordId,
      lastAt: z.iso.datetime().nullable(),
      /** Who wrote the last message: the customer, someone on the team, the AI, or an automatic message. */
      lastFrom: z.enum(["customer", "team", "ai", "automation"]).nullable(),
      lastText: z.string().nullable(),
      /** Whether WhatsApp's 24-hour window is open: a free message can still go. */
      windowOpen: z.boolean(),
    })
    .nullable(),
  /** What the AI did the last time this follow-up came due. */
  ai: z
    .object({ at: z.iso.datetime(), outcome: z.enum(followUpTouchOutcomes), text: z.string().nullable() })
    .nullable(),
});
export type FollowUpRow = z.infer<typeof followUpRow>;
export const followUpBoard = z.object({ rows: z.array(followUpRow), people: peopleNames });
export type FollowUpBoard = z.infer<typeof followUpBoard>;
