// destinations.*: the agency's destinations (spec 3.6). Anyone who sees leads searches them, for the lead form's
// picker; renaming and merging are settings (settings:manage), on the crm plan module (R18). A merge moves the leads
// and repeat enquiries too (crm's mergeDestinations, R22).
import {
  destination,
  mergeDestinationsInput,
  mergedDestinations,
  renameDestinationInput,
  searchDestinationsInput,
} from "@travel-crm/contracts/catalog";
import { renameDestination, searchDestinations } from "@travel-crm/domain/catalog";
import { mergeDestinations } from "@travel-crm/domain/crm";
import { z } from "zod";
import { orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

/** A destination setting: settings:manage, but the crm plan module's (requires would make it core's). */
const settings = orgProcedure.requires("settings:manage").meta({ planModule: "crm" });

export const destinationsRouter = router({
  /** Live destinations alphabetically, by part of the name or a near miss. */
  search: orgProcedure
    .requires("leads:view")
    .input(searchDestinationsInput)
    .output(z.array(destination))
    .query(({ ctx, input }) => ctx.db.forOrg(ctx.member.organizationId, (tx) => searchDestinations(tx, input))),

  rename: settings
    .input(renameDestinationInput)
    .output(destination)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => renameDestination(tx, ctx.member, input)),
    ),

  /** Merges one destination into another; its leads and repeat enquiries move to the kept one. */
  merge: settings
    .input(mergeDestinationsInput)
    .output(mergedDestinations)
    .mutation(({ ctx, input }) =>
      ctx.db.forOrg(ctx.member.organizationId, (tx) => mergeDestinations(tx, ctx.member, input)),
    ),
});
