// The console's view of the WhatsApp agent, for super admins only: its kept turn traces.
import { aiTraceDetail, aiTraceInput, aiTraceListInput, aiTracePage } from "@travel-crm/contracts/platform";
import * as domain from "@travel-crm/domain/platform";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const aiTransparencyRouter = platformT.router({
  /** The kept turns of one agency (or one of its chats), newest first. */
  traces: superAdminProcedure
    .input(aiTraceListInput)
    .output(aiTracePage)
    .query(({ ctx, input }) => domain.listAiTraces(ctx.services, input)),
  /** One turn's row. A query that records: each opening is written in the platform log. */
  trace: superAdminProcedure
    .input(aiTraceInput)
    .output(aiTraceDetail)
    .query(({ ctx, input }) => domain.openAiTrace(ctx.services, ctx.staff, input)),
});
