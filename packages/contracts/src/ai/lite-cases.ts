// The format of one test chat for the lite agent: the agency it talks to, the chat, what a scripted model answers (CI
// and `--fake` only) and what must and must not happen. Committed cases are invented; real chats stay outside the repo.
import { z } from "zod";
import { checklistItems, handOverReasons, liteMoveKinds } from "./lite.js";

/** The packages the bench's seed agency holds: Manali and Spiti are group trips, Kashmir a custom one. */
export const benchPackages = ["manali", "spiti", "kashmir"] as const;

const line = z.strictObject({
  from: z.enum(["customer", "agency"]),
  text: z.string().max(1000).default(""),
  /** A voice note or a photo arrives as that kind of message; its text, if any, is the caption. */
  kind: z.enum(["text", "audio", "image"]).default("text"),
});

/** One scripted model answer: Understand's form (merged over a quiet one), Write's answer, or text that fits neither. */
const scriptedAnswer = z.union([
  z.strictObject({ understand: z.record(z.string(), z.unknown()) }),
  z.strictObject({ write: z.strictObject({ text: z.string().max(600), cannot_answer: z.boolean().default(false) }) }),
  z.strictObject({ raw: z.string() }),
]);

export const liteCase = z.strictObject({
  name: z.string().min(1).max(120),
  /** Which of the seed's packages the AI may sell. */
  agency: z
    .strictObject({ packages: z.array(z.enum(benchPackages)).default([...benchPackages]) })
    .default({ packages: [...benchPackages] }),
  chat: z.array(line).min(1),
  /** CI and --fake only: the model's answers in the order the turns ask for them. */
  scripted: z.array(scriptedAnswer).default([]),
  expect: z.strictObject({
    sent: z.boolean(),
    includes: z.array(z.string().min(1)).optional(),
    excludes: z.array(z.string().min(1)).optional(),
    actions: z
      .strictObject({ payment: z.boolean(), files: z.boolean(), booking: z.boolean(), handOver: z.boolean() })
      .partial()
      .optional(),
    flagged: z.boolean().optional(),
    /** The last turn's move. */
    move: z.enum(liteMoveKinds).optional(),
    /** The reason of the last hand-over turn; the chat must be handed over. */
    handOver: z.enum(handOverReasons).optional(),
    /** What the chat must hold at the end. */
    knows: z.array(z.enum(checklistItems)).optional(),
  }),
});
export type LiteCase = z.infer<typeof liteCase>;
