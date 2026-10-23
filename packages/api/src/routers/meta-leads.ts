// metaLeads.*: the Meta lead ads' procedures (spec 6.3, ADR 0034), on the crm plan module. Everything needs both leads:create
// and leads:assign (as Sheets): a Page decides owners for leads that may not be the connector's. Connecting and disconnecting
// read the session afresh (they hand out or revoke access to the agency's leads); pause and disconnect only reduce what
// happens, so they are open while the agency is read-only (lifecycle "revoke"). A Page is named by our row id; another
// agency's, a draft and a disconnected one are not found. No procedure returns a token or a ciphertext (M2).
import {
  metaBringInInput,
  metaConnectedPages,
  metaConnectFinished,
  metaConnectFinishInput,
  metaConnectPagesInput,
  metaConnectStarted,
  metaConnectStartInput,
  metaFormInput,
  metaFormList,
  metaFormQuestionsView,
  metaPageDetail,
  metaPageIdInput,
  metaPageList,
  metaProblemInput,
  metaProblemList,
  metaProblemsInput,
  metaSaveQuestionsInput,
} from "@travel-crm/contracts/meta-leads";
import { retryMetaLead } from "@travel-crm/domain/crm";
import {
  bringInForm,
  connectPages,
  disconnectPage,
  finishConnect,
  findPage,
  formQuestions,
  hideProblem,
  listForms,
  listPages,
  metaProblems,
  metaRefusals,
  pageDetailOf,
  pausePage,
  requestCheckNow,
  resumePage,
  saveQuestions,
  startConnect,
  type MetaDependencies,
} from "@travel-crm/domain/meta-leads";
import { isOnDemoPlan } from "@travel-crm/domain/subscriptions";
import { z } from "zod";
import type { Context } from "../context.js";
import { memberNames } from "../member-names.js";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const manager = orgProcedure.requires("leads:create", "leads:assign");
const freshManager = freshProcedure.requires("leads:create", "leads:assign");

/** The module's dependencies, or the refusal that Meta is not set up on this server. */
function metaOf(ctx: Pick<Context, "meta">): MetaDependencies {
  if (ctx.meta === null) throw metaRefusals.notConfigured();
  return ctx.meta;
}

export const metaLeadsRouter = router({
  /** The agency's Pages with their badges, the limit, and whether Meta is set up here and not the demo (spec 3.1). */
  list: manager.output(metaPageList).query(async ({ ctx }) => {
    const { organizationId } = ctx.member;
    return ctx.db.forOrg(organizationId, async (tx) =>
      listPages(tx, { configured: ctx.meta !== null, demo: await isOnDemoPlan(tx, organizationId) }),
    );
  }),

  /** One Page's page, from its counters: the poll the page makes while a check runs. */
  get: manager
    .input(metaPageIdInput)
    .output(metaPageDetail)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const facts = await ctx.db.forOrg(organizationId, (tx) =>
        pageDetailOf(tx, input.pageId, { readOnly: ctx.entitlements?.access !== "full", now: new Date() }),
      );
      const { connectedByUserId, ...detail } = facts;
      const names = await memberNames(ctx.identity, organizationId, [connectedByUserId]);
      return { ...detail, connectedBy: { userId: connectedByUserId, name: names[connectedByUserId] ?? null } };
    }),

  /** A Page's forms with Meta's status and what each has brought in; read from Meta when the last read is over five minutes old. */
  forms: manager
    .input(metaPageIdInput)
    .output(metaFormList)
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.forOrg(ctx.member.organizationId, (tx) => findPage(tx, input.pageId));
      return listForms(metaOf(ctx), page, new Date());
    }),

  /** A form's questions with the match (the defaults until it is brought in) and the checklist (spec 3.4). */
  formQuestions: manager
    .input(metaFormInput)
    .output(metaFormQuestionsView)
    .query(async ({ ctx, input }) => {
      const page = await ctx.db.forOrg(ctx.member.organizationId, (tx) => findPage(tx, input.pageId));
      return formQuestions(metaOf(ctx), page, input.formId);
    }),

  /** Step 1 of connecting: where to send the browser (Facebook's dialog for our configuration). */
  connectStart: freshManager
    .input(metaConnectStartInput)
    .output(metaConnectStarted)
    .mutation(({ ctx, input }) => startConnect(metaOf(ctx), ctx.member, input, new Date())),

  /** Reconnect: the same login for a Page that needs it; finishing it runs the Page again. */
  reconnect: freshManager
    .input(metaPageIdInput)
    .output(metaConnectStarted)
    .mutation(({ ctx, input }) => startConnect(metaOf(ctx), ctx.member, { reconnectPageId: input.pageId }, new Date())),

  /** Step 2: Facebook's code and our state become the Pages the person shared, each with what can be done with it. */
  connectFinish: freshManager
    .input(metaConnectFinishInput)
    .output(metaConnectFinished)
    .mutation(({ ctx, input }) => finishConnect(metaOf(ctx), ctx.member, input, new Date())),

  /** Step 3: subscribes the ticked Pages and keeps them. */
  connectPages: freshManager
    .input(metaConnectPagesInput)
    .output(metaConnectedPages)
    .mutation(({ ctx, input }) => connectPages(metaOf(ctx), ctx.member, input.pageIds, new Date())),

  /** Bring a form in: its matched questions, and whether to also check the last 30 days (Q3). */
  bringIn: manager
    .input(metaBringInInput)
    .mutation(({ ctx, input }) => bringInForm(metaOf(ctx), ctx.member, input, new Date())),

  saveQuestions: manager
    .input(metaSaveQuestionsInput)
    .mutation(({ ctx, input }) => saveQuestions(metaOf(ctx), ctx.member, input, new Date())),

  pause: manager
    .meta({ lifecycle: "revoke" })
    .input(metaPageIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => pausePage(tx, ctx.member, input.pageId)),
    ),

  resume: manager
    .input(metaPageIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => resumePage(tx, ctx.member, input.pageId)),
    ),

  /** Check now: forms' recent leads read at once; META_BUSY within 30 seconds of the last check. */
  checkNow: manager
    .input(metaPageIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => requestCheckNow(tx, input.pageId, new Date())),
    ),

  disconnect: freshManager
    .meta({ lifecycle: "revoke" })
    .input(metaPageIdInput)
    .mutation(({ ctx, input }) => disconnectPage(metaOf(ctx), ctx.member, input.pageId, new Date())),

  /** The leads that couldn't be added, fifty at a time (spec 3.3). */
  problems: manager
    .input(metaProblemsInput)
    .output(metaProblemList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        metaProblems(tx, input.pageId, { after: input.after, limit: input.limit }),
      ),
    ),

  /** Check again on one problem: the lead is read from Meta once more and saved if it can be now. */
  retryLead: manager
    .input(metaProblemInput)
    .output(z.object({ result: z.enum(["added", "merged", "not_added", "settled"]) }))
    .mutation(async ({ ctx, input }) => {
      const meta = metaOf(ctx);
      const result = await retryMetaLead(
        {
          ...meta,
          ownerOf: (organizationId) => ctx.identity.firstOwner(organizationId),
          identity: ctx.identity,
          subscriptions: ctx.subscriptions,
        },
        ctx.member,
        { pageId: input.pageId, leadRowId: input.leadRowId },
        new Date(),
      );
      return { result };
    }),

  hideProblem: manager
    .input(metaProblemInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        hideProblem(tx, ctx.member, input.pageId, input.leadRowId, new Date()),
      ),
    ),
});
