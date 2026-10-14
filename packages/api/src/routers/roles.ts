// Roles and the permission catalog (spec 6.5). Any member may see them; changing them needs roles:manage. Role
// procedures read the session from the database (spec 6.4). The identity module stops anyone granting more than they hold.
import {
  createRoleInput,
  deleteRoleInput,
  permissionCatalogEntry,
  roleSummary,
  updateRoleInput,
} from "@travel-crm/contracts/identity";
import { permissionCatalog } from "@travel-crm/domain/identity";
import { z } from "zod";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const roleManager = freshProcedure.requires("roles:manage");

export const rolesRouter = router({
  list: freshProcedure.output(z.array(roleSummary)).query(({ ctx }) => ctx.identity.roles.list(ctx.member)),

  /** Every permission a role can grant, for the roles editor. */
  permissionCatalog: orgProcedure.output(z.array(permissionCatalogEntry)).query(() => permissionCatalog),

  create: roleManager
    .input(createRoleInput)
    .output(roleSummary)
    .mutation(({ ctx, input }) => ctx.identity.roles.create(ctx.member, input)),

  update: roleManager
    .input(updateRoleInput)
    .output(roleSummary)
    .mutation(({ ctx, input }) => ctx.identity.roles.update(ctx.member, input)),

  /** Deletes a role nobody has (soft delete: its name and key become free). */
  delete: roleManager.input(deleteRoleInput).mutation(async ({ ctx, input }) => {
    await ctx.identity.roles.delete(ctx.member, input);
  }),
});
