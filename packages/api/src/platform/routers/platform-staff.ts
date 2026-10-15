// The console's platform staff (spec 5, 6.1): super admins see them, add support or super admins, change a level,
// remove someone, and set a new temporary password. Support sees only itself, through whoAmI. A temporary password is
// in its one response only.
import {
  addedPlatformStaff,
  addPlatformStaffInput,
  platformStaffEntry,
  platformStaffIdInput,
  setPlatformStaffLevelInput,
  temporaryPasswordOutput,
} from "@travel-crm/contracts/platform";
import {
  addPlatformStaff,
  listPlatformStaff,
  removePlatformStaff,
  resetPlatformStaffPassword,
  setPlatformStaffLevel,
} from "@travel-crm/domain/platform";
import { z } from "zod";
import { superAdminProcedure } from "../procedures.js";
import { platformT } from "../trpc.js";

export const platformStaffRouter = platformT.router({
  list: superAdminProcedure.output(z.array(platformStaffEntry)).query(({ ctx }) => listPlatformStaff(ctx.services)),
  add: superAdminProcedure
    .input(addPlatformStaffInput)
    .output(addedPlatformStaff)
    .mutation(({ ctx, input }) => addPlatformStaff(ctx.services, ctx.staff, input)),
  /** Never the last super admin. A demoted super admin keeps the impersonations they started. */
  setLevel: superAdminProcedure
    .input(setPlatformStaffLevelInput)
    .mutation(({ ctx, input }) => setPlatformStaffLevel(ctx.services, ctx.staff, input)),
  /** Ends their sessions and the impersonations they started at once. Never the last super admin. */
  remove: superAdminProcedure
    .input(platformStaffIdInput)
    .mutation(({ ctx, input }) => removePlatformStaff(ctx.services, ctx.staff, input)),
  resetPassword: superAdminProcedure
    .input(platformStaffIdInput)
    .output(temporaryPasswordOutput)
    .mutation(({ ctx, input }) => resetPlatformStaffPassword(ctx.services, ctx.staff, input)),
});
