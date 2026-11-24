// Try it on the one agent (ruling P10): natural's test turn, with the live prompt and settings and a tap on the offer card.
import { z } from "zod";
import { postedState } from "./natural-try-it.js";
import { testAiInput } from "./try-it.js";

export const oneTestInput = z.strictObject({
  /** Oldest first, ending with the customer's line this turn answers. */
  messages: testAiInput.shape.messages,
  /** The last turn's state, sent back as it came; null starts a new chat. */
  state: postedState.nullable(),
  /** The last customer line is a tap on the state's live offer card (a dry run: nothing is booked). */
  tap: z.enum(["book", "change"]).optional(),
  /** The test chat's id, the same on each of its turns: its turns' trace session. */
  chatId: z.uuid().optional(),
});
export type OneTestInput = z.infer<typeof oneTestInput>;
