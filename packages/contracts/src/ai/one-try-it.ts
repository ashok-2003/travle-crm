// Try it on the one agent (ruling P10): natural's test turn without a prompt choice, since it always reads `latest`.
import { z } from "zod";
import { postedState } from "./natural-try-it.js";
import { testAiInput, testAiModels, testAiTemperatures } from "./try-it.js";

export const oneTestInput = z
  .strictObject({
    /** As lite's: oldest first, ending with the customer's line this turn answers. */
    messages: testAiInput.shape.messages,
    /** The last turn's state, sent back as it came; null starts a new chat. */
    state: postedState.nullable(),
    model: z.enum(testAiModels),
    temperature: z.enum(testAiTemperatures),
    /** The test chat's id, the same on each of its turns: its turns' trace session. */
    chatId: z.uuid().optional(),
  })
  .refine((input) => input.temperature === "default" || input.model === "flash", {
    message: "Only Gemini Flash takes a temperature",
    path: ["temperature"],
  });
export type OneTestInput = z.infer<typeof oneTestInput>;
