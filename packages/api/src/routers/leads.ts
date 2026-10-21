// leads.*: the lead list, a lead's page and every change made from it (spec 3.2-3.4, 6). Reading needs leads:view,
// adding leads:create, changing leads:edit, and reassigning or blocking leads:assign (R17-R20). A lead out of the
// member's scope is "not found" (R26). Pages name people by id; the router adds their names (R13).
import {
  addLeadWorkInput,
  addNoteInput,
  bulkAddWorkInput,
  bulkMoveStageInput,
  bulkReassignInput,
  bulkResult,
  createdLead,
  createLeadInput,
  editPersonInput,
  editTripInput,
  knownContactInput,
  knownContactResult,
  leadCounts,
  leadCountsInput,
  leadDetail,
  leadIdInput,
  leadListPage,
  leadWorker,
  listLeadsInput,
  moveStageInput,
  reassignLeadInput,
  timelineInput,
  timelinePage,
} from "@travel-crm/contracts/crm";
import { task } from "@travel-crm/contracts/tasks";
import {
  addLeadNote,
  addLeadWork,
  blockLeadContact,
  changeEachLead,
  countLeads,
  createLead,
  editLeadPerson,
  editLeadTrip,
  findKnownContact,
  getLead,
  listLeads,
  listLeadTimeline,
  moveLeadStage,
  reassignLead,
  reopenLead,
} from "@travel-crm/domain/crm";
import { z } from "zod";
import { leadWorkerIds, leadWorkerIdsIfOther } from "../lead-workers.js";
import { memberNames } from "../member-names.js";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const viewer = orgProcedure.requires("leads:view");
const editor = orgProcedure.requires("leads:edit");
const assigner = orgProcedure.requires("leads:assign");

export const leadsRouter = router({
  /** A page of leads, newest first: Mine · open unless asked otherwise; a salesperson only ever sees their own. */
  list: viewer
    .input(listLeadsInput)
    .output(leadListPage)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const page = await ctx.db.forOrg(organizationId, (tx) => listLeads(tx, ctx.member, input));
      const people = await memberNames(
        ctx.identity,
        organizationId,
        page.items.map((item) => item.ownerUserId),
      );
      return { ...page, people };
    }),

  /** Open leads by stage, for the quick filters. */
  counts: viewer
    .input(leadCountsInput)
    .output(leadCounts)
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => countLeads(tx, ctx.member, input))),

  /** Who may own a lead (names only): every lead worker for a holder of leads:assign, otherwise only themselves. */
  owners: viewer.output(z.array(leadWorker)).query(async ({ ctx }) => {
    const workers = await ctx.identity.leadWorkers(ctx.member.organizationId);
    if (ctx.member.permissions.has("leads:assign")) return workers;
    return workers.filter((worker) => worker.userId === ctx.member.userId);
  }),

  /** Who these contacts belong to, before saving: an open lead's destination and owner, its id only if visible. */
  knownContact: viewer
    .input(knownContactInput)
    .output(knownContactResult)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const known = await ctx.db.forOrg(organizationId, (tx) => findKnownContact(tx, ctx.member, input));
      const people = await memberNames(ctx.identity, organizationId, [known.match?.openLead?.ownerUserId]);
      return { ...known, people };
    }),

  get: viewer
    .input(leadIdInput)
    .output(leadDetail)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const lead = await ctx.db.forOrg(organizationId, (tx) => getLead(tx, ctx.member, input.leadId));
      const mentioned = [lead.ownerUserId, lead.createdBy, ...lead.work.map((work) => work.assigneeUserId)];
      return { ...lead, people: await memberNames(ctx.identity, organizationId, mentioned) };
    }),

  timeline: viewer
    .input(timelineInput)
    .output(timelinePage)
    .query(async ({ ctx, input }) => {
      const { organizationId } = ctx.member;
      const page = await ctx.db.forOrg(organizationId, (tx) => listLeadTimeline(tx, ctx.member, input));
      const mentioned = page.entries.flatMap((entry) => [
        entry.actorUserId,
        entry.kind === "reassigned" ? entry.ownerUserId : null,
      ]);
      return { ...page, people: await memberNames(ctx.identity, organizationId, mentioned) };
    }),

  /** Adds a lead, or a repeat enquiry to the person's open lead (the form's choice, R24). */
  create: orgProcedure
    .requires("leads:create")
    .input(createLeadInput)
    .output(createdLead)
    .mutation(async ({ ctx, input }) => {
      const owners = await leadWorkerIdsIfOther(ctx.identity, ctx.member, input.ownerUserId);
      return createLead(ctx.db, ctx.member, input, { owners, now: new Date() });
    }),

  addNote: editor
    .input(addNoteInput)
    .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => addLeadNote(tx, ctx.member, input))),

  moveStage: editor
    .input(moveStageInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => moveLeadStage(tx, ctx.member, input, new Date())),
    ),

  reopen: editor
    .input(leadIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => reopenLead(tx, ctx.member, input, new Date())),
    ),

  editTrip: editor
    .input(editTripInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => editLeadTrip(tx, ctx.member, input)),
    ),

  editPerson: editor
    .input(editPersonInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => editLeadPerson(tx, ctx.member, input)),
    ),

  /** A follow-up or task on the lead, for its owner. */
  addWork: editor
    .input(addLeadWorkInput)
    .output(task)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => addLeadWork(tx, ctx.member, input, new Date())),
    ),

  /** Gives the lead, with its open tasks, to someone who can work leads. */
  reassign: assigner.input(reassignLeadInput).mutation(async ({ ctx, input }) => {
    const owners = await leadWorkerIds(ctx.identity, ctx.member.organizationId);
    return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
      reassignLead(tx, ctx.member, input, { owners, now: new Date() }),
    );
  }),

  /** Moves the chosen leads to a stage, each as a move of one lead would (release C). */
  bulkMoveStage: editor
    .input(bulkMoveStageInput)
    .output(bulkResult)
    .mutation(({ ctx, input }) => {
      const now = new Date();
      return changeEachLead(ctx.db, ctx.member, input.leadIds, (tx, leadId) =>
        moveLeadStage(tx, ctx.member, { leadId, stage: input.stage }, now),
      );
    }),

  /** Gives the chosen leads, with their open tasks, to someone who can work leads. */
  bulkReassign: assigner
    .input(bulkReassignInput)
    .output(bulkResult)
    .mutation(async ({ ctx, input }) => {
      const owners = await leadWorkerIds(ctx.identity, ctx.member.organizationId);
      const now = new Date();
      return changeEachLead(ctx.db, ctx.member, input.leadIds, (tx, leadId) =>
        reassignLead(tx, ctx.member, { leadId, ownerUserId: input.ownerUserId }, { owners, now }),
      );
    }),

  /** The same follow-up or task on each chosen lead, for its owner. */
  bulkAddWork: editor
    .input(bulkAddWorkInput)
    .output(bulkResult)
    .mutation(({ ctx, input }) => {
      const { leadIds, ...work } = input;
      const now = new Date();
      return changeEachLead(ctx.db, ctx.member, leadIds, (tx, leadId) =>
        addLeadWork(tx, ctx.member, { leadId, ...work }, now),
      );
    }),

  /** Blocks the lead's phone (else email, else handle) and marks it Not a lead. */
  block: assigner
    .input(leadIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => blockLeadContact(tx, ctx.member, input, new Date())),
    ),
});
