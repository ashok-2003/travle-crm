// The format of one test chat for the grounded agent: the agency it talks to, the chat, what a scripted model answers (CI
// only) and what must and must not happen. Hand-written JSON files hold these; they carry invented names, never real ones.
import { z } from "zod";
import { readAnswer, writeAnswer } from "./grounded.js";

/** The packages the shared seed holds: Manali and Spiti are group trips, Kashmir a custom one. */
export const caseAgencyPackages = ["manali", "spiti", "kashmir"] as const;

const line = z.strictObject({
  from: z.enum(["customer", "agency"]),
  text: z.string().max(1000).default(""),
  /** A voice note or a photo arrives as that kind of message; its text, if any, is the caption. */
  kind: z.enum(["text", "audio", "image"]).default("text"),
});

/** A scripted answer: the JSON a model would give, or plain text to play an answer that does not fit. */
const readScript = z.union([readAnswer.partial(), z.string()]);
const writeScript = z.union([
  z.strictObject({ reply: z.string(), actions: writeAnswer.shape.actions.partial().optional() }),
  z.string(),
]);

export const agentCase = z.strictObject({
  name: z.string().min(1).max(120),
  /** Which of the shared seed's packages the AI may sell, and whether it plans custom trips. */
  agency: z
    .strictObject({
      packages: z.array(z.enum(caseAgencyPackages)).default([...caseAgencyPackages]),
      customTrips: z.boolean().default(false),
    })
    .default({ packages: [...caseAgencyPackages], customTrips: false }),
  chat: z.array(line).min(1),
  /** True plays the same job twice with the same token, as a retry does. */
  retry: z.boolean().default(false),
  /** For CI only, with the memory model: the read, then each write (the second when the first is refused). */
  scripted: z.strictObject({ read: readScript.optional(), write: z.array(writeScript).default([]) }).optional(),
  expect: z.strictObject({
    /** Whether a reply reached the customer. */
    sent: z.boolean(),
    /** Words the text actually sent (after code filled it in) holds, case-insensitive. */
    includes: z.array(z.string().min(1)).optional(),
    excludes: z.array(z.string().min(1)).optional(),
    actions: z
      .strictObject({
        payment: z.boolean().optional(),
        files: z.boolean().optional(),
        booking: z.boolean().optional(),
        handOver: z.boolean().optional(),
      })
      .optional(),
    /** Whether the team was told (the chat flagged, or handed over). */
    flagged: z.boolean().optional(),
    /** How many notices the team got about it. */
    notices: z.int().min(0).optional(),
    /** The reason code of the flag: the check's refusal ("amount", "payment_claim"...) or a code's ("not_run"). */
    blockedReason: z.string().min(1).optional(),
    /** How many messages of the AI the chat holds at the end. */
    messages: z.int().min(0).optional(),
    /** The records one booking makes, counted after every run. */
    records: z.strictObject({ bookings: z.int(), holds: z.int(), quotes: z.int() }).partial().optional(),
  }),
});
export type AgentCase = z.infer<typeof agentCase>;
export type AgentCaseInput = z.input<typeof agentCase>;
