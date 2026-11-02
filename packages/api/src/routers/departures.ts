// departures.*: group departures (release 7a): seen by whoever holds departures:view, held for a lead and joined on the
// waitlist with departures:create (the Sales role), changed, closed, cancelled and roomed with departures:edit. A departure's
// profit needs the accounts as well. Making a quote from a hold, or putting a draft quote on a departure, needs the quote's
// own permission too. The rooming list's PDF takes a document number, so it reads the session afresh.
import {
  addRoomInput,
  addWaitlistInput,
  cancelDepartureInput,
  createDepartureInput,
  createHoldInput,
  departureDetail,
  departureIdInput,
  departureList,
  departureMoney,
  departureSettings,
  holdIdInput,
  leadDepartureList,
  leadHoldsInput,
  listDeparturesInput,
  moveTravellerInput,
  roomIdInput,
  rooming,
  roomingCsv,
  roomingDocument,
  saveDepartureSettingsInput,
  saveRoomingStayInput,
  setDepartureStatusInput,
  setQuoteDepartureInput,
  stayIdInput,
  updateDepartureInput,
  updateRoomInput,
  waitlistIdInput,
} from "@travel-crm/contracts/departures";
import { downloadLink } from "@travel-crm/contracts/files";
import {
  addRoom,
  addToWaitlist,
  cancelDeparture,
  copyStayLayout,
  createDeparture,
  createHold,
  departureMoneyOf,
  departureSettingsView,
  draftStayRooms,
  getDeparture,
  getRooming,
  issueRoomingList,
  listDepartures,
  listLeadDepartures,
  makeQuoteFromHold,
  moveTraveller,
  releaseHold,
  removeFromWaitlist,
  removeRoom,
  removeRoomingStay,
  roomingCsvOf,
  saveDepartureSettings,
  saveRoomingStay,
  setDepartureStatus,
  setQuoteDeparture,
  updateDeparture,
  updateRoom,
} from "@travel-crm/domain/departures";
import { assertPdfCanBeMade, getIssuedDocument } from "@travel-crm/domain/documents";
import { DomainError } from "@travel-crm/domain/kernel";
import { z } from "zod";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";
import { documentContext, quoteContext } from "./quotes.js";

const viewer = orgProcedure.requires("departures:view");
const creator = orgProcedure.requires("departures:view", "departures:create");
const editor = orgProcedure.requires("departures:view", "departures:edit");
// A rooming list takes a document number: read from the database, never the five-minute session cache.
const freshEditor = freshProcedure.requires("departures:view", "departures:edit");
const profitViewer = freshProcedure.requires("departures:view", "accounts:view");

export const departuresRouter = router({
  list: viewer
    .input(listDeparturesInput)
    .output(departureList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listDepartures(tx, ctx.member, input, new Date())),
    ),

  get: viewer
    .input(departureIdInput)
    .output(departureDetail)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => getDeparture(tx, input.departureId, new Date())),
    ),

  /** The departure's profit: its bookings' price against what they and the departure cost. */
  money: profitViewer
    .input(departureIdInput)
    .output(departureMoney)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => departureMoneyOf(tx, input.departureId)),
    ),

  create: creator
    .input(createDepartureInput)
    .output(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => createDeparture(tx, ctx.member, input)),
    ),

  update: editor
    .input(updateDepartureInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => updateDeparture(tx, ctx.member, input)),
    ),

  setStatus: editor
    .input(setDepartureStatusInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setDepartureStatus(tx, ctx.member, input)),
    ),

  cancel: editor
    .input(cancelDepartureInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => cancelDeparture(tx, ctx.member, input, new Date())),
    ),

  hold: creator
    .input(createHoldInput)
    .output(z.object({ holdId: z.uuid(), expiresAt: z.iso.datetime() }))
    .mutation(async ({ ctx, input }) => {
      const hold = await ctx.db.forOrg(ctx.member.organizationId, (tx) =>
        createHold(tx, ctx.member, input, new Date()),
      );
      return { holdId: hold.id, expiresAt: hold.expiresAt.toISOString() };
    }),

  releaseHold: creator
    .input(holdIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => releaseHold(tx, ctx.member, input.holdId, new Date())),
    ),

  addToWaitlist: creator
    .input(addWaitlistInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => addToWaitlist(tx, ctx.member, input)),
    ),

  removeFromWaitlist: creator
    .input(waitlistIdInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => removeFromWaitlist(tx, ctx.member, input.waitlistId)),
    ),

  /** "Make quote" on a hold: a draft quote for the held seats, on the departure. */
  makeQuote: orgProcedure
    .requires("departures:view", "quotes:create")
    .input(holdIdInput)
    .output(z.object({ quoteId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const context = await quoteContext(ctx);
      return ctx.db.forOrg(ctx.member.organizationId, (tx) => makeQuoteFromHold(tx, ctx.member, input.holdId, context));
    }),

  /** "Add to departure" on a draft quote, or take it off again. */
  setQuoteDeparture: orgProcedure
    .requires("departures:view", "quotes:edit")
    .input(setQuoteDepartureInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => setQuoteDeparture(tx, ctx.member, input)),
    ),

  /** A lead's holds and waitlist places, for the lead's page. */
  forLead: viewer
    .input(leadHoldsInput)
    .output(leadDepartureList)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => listLeadDepartures(tx, ctx.member, input.leadId, new Date())),
    ),

  settings: viewer
    .output(departureSettings)
    .query(({ ctx }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => departureSettingsView(tx))),

  saveSettings: freshProcedure
    .requires("settings:manage")
    .input(saveDepartureSettingsInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => saveDepartureSettings(tx, ctx.member, input)),
    ),

  rooming: router({
    get: viewer
      .input(departureIdInput)
      .output(rooming)
      .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => getRooming(tx, input.departureId))),

    saveStay: editor
      .input(saveRoomingStayInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => saveRoomingStay(tx, ctx.member, input)),
      ),

    removeStay: editor
      .input(stayIdInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => removeRoomingStay(tx, ctx.member, input.stayId)),
      ),

    addRoom: editor
      .input(addRoomInput)
      .mutation(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => addRoom(tx, ctx.member, input))),

    updateRoom: editor
      .input(updateRoomInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => updateRoom(tx, ctx.member, input)),
      ),

    removeRoom: editor
      .input(roomIdInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => removeRoom(tx, ctx.member, input.roomId)),
      ),

    move: editor
      .input(moveTravellerInput)
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => moveTraveller(tx, ctx.member, input)),
      ),

    draft: editor
      .input(stayIdInput)
      .output(z.object({ unassigned: z.int() }))
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => draftStayRooms(tx, ctx.member, input.stayId)),
      ),

    copyLayout: editor
      .input(stayIdInput)
      .output(z.object({ copied: z.int() }))
      .mutation(({ ctx, input }) =>
        ctx.db.forOrg(ctx.member.organizationId, (tx) => copyStayLayout(tx, ctx.member, input.stayId)),
      ),

    /** The stay's rooming list as a numbered PDF, as it is now; the one issued before when nothing changed since. */
    issue: freshEditor
      .input(stayIdInput)
      .output(roomingDocument)
      .mutation(async ({ ctx, input }) => {
        const context = await documentContext(ctx);
        return ctx.db.forOrg(ctx.member.organizationId, (tx) =>
          issueRoomingList(tx, ctx.member, input.stayId, context.branding, new Date()),
        );
      }),

    csv: freshProcedure
      .requires("departures:view")
      .meta({ lifecycle: "export" })
      .input(stayIdInput)
      .output(roomingCsv)
      .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => roomingCsvOf(tx, input.stayId))),

    /** A five-minute link to a stay's rooming PDF; DOCUMENT_NOT_READY while the worker renders it. */
    documentLink: freshProcedure
      .requires("departures:view")
      .meta({ lifecycle: "export" })
      .input(z.strictObject({ stayId: z.uuid(), documentId: z.uuid() }))
      .output(downloadLink)
      .mutation(async ({ ctx, input }) => {
        const document = await ctx.db.forOrg(ctx.member.organizationId, async (tx) => {
          const stay = await tx.departureStay.findUnique({
            where: { id: input.stayId },
            select: { roomingDocumentId: true },
          });
          if (stay?.roomingDocumentId !== input.documentId) {
            throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such document");
          }
          return getIssuedDocument(tx, { documentId: input.documentId });
        });
        assertPdfCanBeMade(document);
        if (document.pdfAttachmentId === null) {
          throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_READY", "The document is still being prepared");
        }
        const link = await ctx.files.systemDownloadLink(ctx.member.organizationId, {
          attachmentId: document.pdfAttachmentId,
        });
        return { url: link.url, expiresAt: link.expiresAt.toISOString() };
      }),
  }),
});
