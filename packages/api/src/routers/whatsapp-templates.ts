// whatsappTemplates.*: the agency's message templates (spec 3.3, 3.4, 6.3), each on one WhatsApp number. The agency's Owner or
// Admin (inbox:templates) writes, edits when rejected, archives and refreshes; whoever may reply reads the approved ones of a
// chat's number for the send dialog. Meta's rules are the contract's checks; the provider is called by the domain, never with
// a customer's words. The list inputs are optional, so a call naming no number gets the main number's (MN3).
import {
  createTemplateInput,
  editTemplateInput,
  sendableTemplatesInput,
  templateIdInput,
  templateList,
  templateListInput,
} from "@travel-crm/contracts/inbox";
import { recordId } from "@travel-crm/contracts/identity";
import {
  archiveTemplate,
  createTemplate,
  editTemplate,
  listTemplates,
  sendableTemplates,
  syncTemplates,
} from "@travel-crm/domain/inbox";
import { z } from "zod";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const manager = orgProcedure.requires("inbox:templates");
const replier = orgProcedure.requires("inbox:view", "inbox:reply");

export const whatsappTemplatesRouter = router({
  /** A number's templates but the archived (the main number's unless one is named), with its month's marketing count. */
  list: manager
    .input(templateListInput.optional())
    .output(templateList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        listTemplates(tx, {
          onlyApproved: false,
          now: new Date(),
          ...(input?.connectionId === undefined ? {} : { connectionId: input.connectionId }),
        }),
      ),
    ),

  /** The approved ones of the chat's number, else the named number, else the main one: the send dialog's. */
  sendable: replier
    .input(sendableTemplatesInput.optional())
    .output(templateList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => sendableTemplates(tx, ctx.member, input ?? {}, new Date())),
    ),

  /** Written on the named live number, else the main one. */
  create: manager
    .input(createTemplateInput)
    .output(z.object({ templateId: recordId }))
    .mutation(({ ctx, input }) =>
      createTemplate(
        { db: ctx.db, provider: ctx.whatsappProvider ?? null, firstOwner: (id) => ctx.identity.firstOwner(id) },
        ctx.member,
        input,
        new Date(),
      ),
    ),

  /** Edit and send again: a template that Meta rejected. */
  edit: manager
    .input(editTemplateInput)
    .mutation(({ ctx, input }) =>
      editTemplate(
        { db: ctx.db, provider: ctx.whatsappProvider ?? null, firstOwner: (id) => ctx.identity.firstOwner(id) },
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

  /** Reads every live number's templates and their statuses from the provider. */
  refresh: manager
    .output(z.object({ templates: z.number().int() }))
    .mutation(({ ctx }) =>
      syncTemplates(
        { db: ctx.db, provider: ctx.whatsappProvider ?? null, firstOwner: (id) => ctx.identity.firstOwner(id) },
        ctx.member.organizationId,
        new Date(),
      ),
    ),
});
