// ai.departures.*: AI part 3 (release ai3) on a departure. "Read requests" proposes room requests from the travellers' notes
// (departures:edit, like the rooming list's own changes; nothing is saved, the apply is departures.rooming.setRequests). "Find
// interested people" is a plain query. "Write message" is one AI call for one person, and "Sent" marks the offer after staff
// opened it in their own WhatsApp; the product sends nothing. Each needs ai:suggest, so the plan's `ai` module as well as
// `departures`.
import {
  findInterestedInput,
  interestedPeople,
  markOfferSentInput,
  readRoomRequestsInput,
  roomRequestsProposal,
  seatMessage,
  writeSeatMessageInput,
} from "@travel-crm/contracts/ai";
import { findInterestedPeople, readRoomRequests, recordOfferSent, writeSeatMessage } from "@travel-crm/domain/ai";
import { findDeparture } from "@travel-crm/domain/departures";
import { DomainError } from "@travel-crm/domain/kernel";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const reader = orgProcedure.requires("ai:suggest", "departures:view", "departures:edit");
const seller = orgProcedure.requires("ai:suggest", "departures:view", "departures:create", "leads:view");

export const aiDeparturesRouter = router({
  /** Which travellers asked for what about their room, read from their notes; proposed, never saved. */
  readRoomRequests: reader
    .input(readRoomRequestsInput)
    .output(roomRequestsProposal)
    .mutation(({ ctx, input }) => {
      if (!ctx.ai?.configured) {
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      }
      return readRoomRequests({ db: ctx.db, model: ctx.ai }, ctx.member, input, new Date());
    }),

  /** People who asked about this place and may be offered the departure's empty seats: a plain query, no AI. */
  findInterested: seller
    .input(findInterestedInput)
    .output(interestedPeople)
    .query(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, async (tx) =>
        findInterestedPeople(tx, ctx.member, await findDeparture(tx, input.departureId), new Date()),
      ),
    ),

  /** One personal message for one person, to edit and open in the staff member's own WhatsApp. */
  writeSeatMessage: seller
    .input(writeSeatMessageInput)
    .output(seatMessage)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.ai?.configured) {
        throw new DomainError("CONFLICT", "AI_NOT_READY", "The AI isn't set up on this server yet");
      }
      const agencyName = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.name ?? "the agency";
      return writeSeatMessage(ctx.db, ctx.ai, ctx.member, input, { agencyName, now: new Date() });
    }),

  /** The staff member opened the message in WhatsApp: the lead is marked as offered this departure. */
  markOfferSent: orgProcedure
    .requires("ai:suggest", "departures:view", "departures:create", "leads:edit")
    .input(markOfferSentInput)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => recordOfferSent(tx, ctx.member, input, new Date())),
    ),
});
