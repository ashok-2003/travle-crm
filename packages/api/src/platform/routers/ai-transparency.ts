// The console's view of the lite WhatsApp agent, for super admins only: its prompt library and kept turn traces.
import {
  aiPromptLibrary,
  aiTraceDetail,
  aiTraceInput,
  aiTraceListInput,
  aiTracePage,
} from "@travel-crm/contracts/platform";
import * as domain from "@travel-crm/domain/platform";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const aiTransparencyRouter = platformT.router({
  /** Every fixed prompt piece with its version and text, and what each of the two model calls is given. */
  prompts: superAdminProcedure.output(aiPromptLibrary).query(() => domain.getAiPromptLibrary()),
  /** The kept turns of one agency (or one of its chats), newest first. */
  traces: superAdminProcedure
    .input(aiTraceListInput)
    .output(aiTracePage)
    .query(({ ctx, input }) => domain.listAiTraces(ctx.services, input)),
  /** One turn with its whole trace. A query that records: each opening is written in the platform log. */
  trace: superAdminProcedure
    .input(aiTraceInput)
    .output(aiTraceDetail)
    .query(({ ctx, input }) => domain.openAiTrace(ctx.services, ctx.staff, input)),
});
