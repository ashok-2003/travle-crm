// Writes the reply: one model call that returns the reply (placeholders for every figure) and the actions it picks; code
// then fills, checks and cuts the actions down to those allowed (Tasks 3, 4, 6, 8). It neither reserves nor releases the
// monthly AI limit; the caller does.
import { writeAnswer, writeAnswerJsonSchema, type WriteAnswer } from "@travel-crm/contracts/ai";
import type { AiFailure, AiMessage, AiModel } from "@travel-crm/integrations/ai";
import { fenced, type TurnKind } from "../agent-prompt.js";
import { asTranscript } from "../agent-context.js";
import type { AutopilotRow } from "../autopilot.js";
import { ANSWER_MAX_TOKENS, askFor } from "./ask.js";
import { groundedPrompt, type GroundedPack } from "./prompt.js";

export interface WriteInput {
  settings: AutopilotRow;
  agency: string;
  kind: TurnKind;
  pack: GroundedPack;
  /** The chat's last messages, the customer as user and the agency as assistant. */
  messages: AiMessage[];
}

export type WriteResult =
  | { ok: true; value: WriteAnswer; usage: { model: string; inputTokens: number; outputTokens: number } }
  | { ok: false; reason: AiFailure | "unfit" };

/**
 * `reason` is why this is asked again (what the check found wrong with the last reply) or why a nudge or follow-up is
 * written; it reaches the model fenced, after the chat.
 */
export async function writeReply(model: AiModel, input: WriteInput, reason?: string): Promise<WriteResult> {
  const chat = asTranscript(input.messages, input.kind);
  const asked = await askFor(
    model,
    {
      feature: "autopilot",
      maxTokens: ANSWER_MAX_TOKENS,
      messages: [
        { role: "system", content: groundedPrompt(input.settings, input.agency, input.kind, input.pack) },
        reason === undefined ? chat : { ...chat, content: `${chat.content}\n\nReason: <data>${fenced(reason)}</data>` },
      ],
      schema: { name: "write_answer", jsonSchema: writeAnswerJsonSchema },
    },
    writeAnswer,
  );
  if (!asked.ok) return asked;
  return {
    ok: true,
    value: asked.value,
    usage: { model: asked.model, inputTokens: asked.inputTokens, outputTokens: asked.outputTokens },
  };
}
