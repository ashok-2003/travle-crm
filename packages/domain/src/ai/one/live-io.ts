// The one agent's live turn's ways to the data (R4, R5): natural's counted model call, its read tools and its action
// staging (with one's own checks), each in a transaction of its own, and its look for a newer customer line; no word
// guards. The tool agent runs the model and the tools.
import type { OrgTx } from "@travel-crm/db";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { ToolAgent } from "@travel-crm/integrations/tool-agent";
import type { LiteDependencies, LiteTurnInput } from "../lite/types.js";
import { countedModel } from "../natural/counted-model.js";
import { liveActionContext, newerLineIn } from "../natural/live-io.js";
import type { NaturalPrepared } from "../natural/prepare.js";
import { stageAction } from "../natural/tools/action-tools.js";
import { runReadTool, type ReadContext } from "../natural/tools/read-tools.js";
import type { ToolTurnSink } from "../traces/trace-sink.js";
import type { OneContext } from "./context.js";
import { lookAtImage, transcribeVoiceNote } from "./media.js";
import type { OneLoopIO } from "./loop.js";

export interface OneTurnDependencies extends LiteDependencies {
  /** Langfuse's prompts: live turns run on whatsapp-agent/real-agent at label production, else the built-in text. */
  prompts?: AiPrompts;
  /** Runs the model and the tools (LangGraph's in the worker). */
  toolAgent: ToolAgent;
  /** Keeps each turn that read the chat as a row of ai_turn_trace; without one, none is kept. */
  toolTurns?: ToolTurnSink;
}

/** The loop's IO for one live turn on `context`, the context built from `prepared`; `clock` in epoch milliseconds. */
export function oneLiveIO(
  deps: Pick<OneTurnDependencies, "db" | "ai" | "toolAgent" | "files">,
  prepared: NaturalPrepared,
  input: LiteTurnInput,
  context: OneContext,
  now: Date,
  clock: () => number,
): OneLoopIO {
  const { db } = deps;
  const { organizationId } = input;
  const { sheets, today, timeZone } = prepared;
  const readContext = (tx: OrgTx): ReadContext => ({ tx, sheets, labels: context.labels, today, now });
  const actions = liveActionContext(db, prepared, input, context, now);
  const call = countedModel(deps.ai, { db, organizationId, now, timeZone });
  return {
    agent: deps.toolAgent,
    call,
    // The tool layer has already checked the reference is this chat's own customer file.
    media: async (name, args) => {
      const messageId = context.media.get(String(args.message))?.messageId;
      if (messageId === undefined) return "refused: that isn't one of this chat's files";
      const reading = { db, files: deps.files, call, organizationId };
      const where = { conversationId: input.conversationId, messageId };
      const done =
        name === "look_at_image"
          ? await lookAtImage(reading, { ...where, question: typeof args.question === "string" ? args.question : null })
          : await transcribeVoiceNote(reading, where);
      return done.ok ? done.text : done.refused;
    },
    read: (name, args) => db.forOrg(organizationId, (tx) => runReadTool(readContext(tx), name, args)),
    stage: (name, args, words, quoted) =>
      stageAction({ ...actions, quotedThisTurn: quoted }, name, args, words, { agent: "one" }),
    newerLine: () => newerLineIn(db, input, prepared.lastInboundAt),
    clock,
  };
}
