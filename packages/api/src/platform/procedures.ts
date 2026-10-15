// The console's procedure builders. Every request is checked against the database: signed in, platform staff (a
// platform role and no membership), no temporary password left to replace; super admins for the rest (spec 5).
import { TRPCError } from "@trpc/server";
import { DomainError } from "@travel-crm/domain/kernel";
import { domainErrorsAsStatus } from "../errors.js";
import { platformT } from "./trpc.js";

/** Every procedure turns domain errors into their HTTP status. */
const base = platformT.procedure.use(domainErrorsAsStatus);

/** Platform staff of either level. The context read the session from the database, so a revoked one stops at once. */
export const staffProcedure = base.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  // An impersonation session acts as its user, never as platform staff, whoever that user is: refused here rather
  // than left to Better Auth's refusal to let support impersonate other platform staff.
  const staff = ctx.session.impersonatedBy ? null : await ctx.services.identity.describePlatformStaff(ctx.user.id);
  if (!staff) throw new DomainError("FORBIDDEN", "PLATFORM_ONLY", "Only platform staff can do this");
  if (staff.mustChangePassword) throw new DomainError("FORBIDDEN", "CHANGE_PASSWORD", "Choose a new password first");
  return next({ ctx: { session: ctx.session, user: ctx.user, staff } });
});

/** Super admins only: plans, platform staff and permanent deletion. */
export const superAdminProcedure = staffProcedure.use(({ ctx, next }) => {
  if (ctx.staff.level !== "super-admin") {
    throw new DomainError("FORBIDDEN", "SUPER_ADMIN_ONLY", "Only a super admin can do this");
  }
  return next();
});
