// Try it on the one agent (ruling P10): natural's test turn, with the live settings, a tap on the offer card, and the
// prompt to run: the live one or the draft being edited in Langfuse.
import { z } from "zod";
import { postedState } from "./natural-try-it.js";
import { testAiInput } from "./try-it.js";

/** The prompt a test turn runs on: the live one (Langfuse's label production), or the draft (label draft). */
export const oneTestPrompts = ["live", "draft"] as const;
export type OneTestPrompt = (typeof oneTestPrompts)[number];
/** The Langfuse label each prompt is read at, as a turn's trace names it. */
export const onePromptLabels = { live: "production", draft: "draft" } as const satisfies Record<OneTestPrompt, string>;

export const oneTestInput = z.strictObject({
  /** Oldest first, ending with the customer's line this turn answers. */
  messages: testAiInput.shape.messages,
  /** The last turn's state, sent back as it came; null starts a new chat. */
  state: postedState.nullable(),
  /** The last customer line is a tap on the state's live offer card (a dry run: nothing is booked). */
  tap: z.enum(["book", "change"]).optional(),
  /** Live unless the client names one, so a page loaded before the choice existed still works. */
  prompt: z.enum(oneTestPrompts).default("live"),
  /** The test chat's id, the same on each of its turns: its turns' trace session. */
  chatId: z.uuid().optional(),
});
export type OneTestInput = z.infer<typeof oneTestInput>;
