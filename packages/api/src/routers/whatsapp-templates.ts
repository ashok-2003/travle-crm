// whatsappTemplates.*: the agency's message templates (spec 3.3, 3.4, 6.3). The agency's Owner or Admin (inbox:templates) writes,
// edits when rejected, archives and refreshes; whoever may reply reads the approved ones for the send dialog. Meta's rules are
// the contract's checks; the provider is called by the domain, never with a customer's words.
import { editTemplateInput, templateDraftInput, templateIdInput, templateList } from "@travel-crm/contracts/inbox";
import { recordId } from "@travel-crm/contracts/identity";
import { archiveTemplate, createTemplate, editTemplate, listTemplates, syncTemplates } from "@travel-crm/domain/inbox";
import { z } from "zod";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const manager = orgProcedure.requires("inbox:templates");
const replier = orgProcedure.requires("inbox:view", "inbox:reply");

export const whatsappTemplatesRouter = router({
  /** Every template but the archived, with the month's marketing count against the cap. */
  list: manager
    .output(templateList)
    .query(({ ctx }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listTemplates(tx, { onlyApproved: false, now: new Date() })),
    ),

  /** The approved ones, for the send dialog. */
  sendable: replier
    .output(templateList)
    .query(({ ctx }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listTemplates(tx, { onlyApproved: true, now: new Date() })),
    ),

  create: manager
    .input(templateDraftInput)
    .output(z.object({ templateId: recordId }))
    .mutation(({ ctx, input }) =>
      createTemplate({ db: ctx.db, provider: ctx.whatsappProvider ?? null }, ctx.member, input, new Date()),
    ),

  /** Edit and send again: a template that Meta rejected. */
  edit: manager
    .input(editTemplateInput)
    .mutation(({ ctx, input }) =>
      editTemplate(
        { db: ctx.db, provider: ctx.whatsappProvider ?? null },
        ctx.member,
        input.templateId,
        input.draft,
        new Date(),
      ),
    ),

  archive: manager
    .input(templateIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => archiveTemplate(tx, ctx.member, input.templateId)),
    ),

  /** Reads the templates and their statuses from the provider. */
  refresh: manager
    .output(z.object({ templates: z.number().int() }))
    .mutation(({ ctx }) =>
      syncTemplates({ db: ctx.db, provider: ctx.whatsappProvider ?? null }, ctx.member.organizationId, new Date()),
    ),
});
