// The procedure builders. Each request runs the checks of spec 6.5 in order:
//   1 signed in → 2 organization active → 3 module on the plan → 4 role permission → handler.
// Checks 2 and 3 arrive with subscriptions (plan 4), inside memberAccessFor() and requires(), so call sites stay the
// same. Check 5 (own or all records) is the handler's, through scopeFilter(); check 6 is Postgres row-level security.
import { TRPCError } from "@trpc/server";
import { pendingStep, type Identity, type MemberAccess, type Permission } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import { forwardCookies } from "./context.js";
import { toTrpcError } from "./errors.js";
import { t } from "./trpc.js";

/** Every procedure turns domain errors into their HTTP status. */
const base = t.procedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DomainError) throw toTrpcError(result.error.cause);
  return result;
});

export const publicProcedure = base;

/** Check 1, from the session cookie. Cached for up to 5 minutes, so a revoked session still passes for that long. */
export const protectedProcedure = base.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { session: ctx.session, user: ctx.user } });
});

/** Check 1 against the database, ignoring the cookie cache: a revoked session stops at once (spec 6.4). */
const freshlySignedIn = base.use(async ({ ctx, next }) => {
  const { headers, response } = await ctx.identity.auth.api.getSession({
    headers: ctx.headers,
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
  forwardCookies(headers, ctx.resHeaders);
  if (!response) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { session: response.session, user: response.user } });
});

interface SignedInContext {
  identity: Identity;
  session: { activeOrganizationId?: string | null | undefined };
  user: { id: string };
}

/**
 * The member's access in the session's organization, read from the database on every request, so a removal or role
 * change applies to the next request. Members with a password change or two-factor setup still to do are refused
 * here; the endpoints they need for it (Better Auth's /change-password and /two-factor/*, and me.get) stay open.
 */
async function memberAccessFor(ctx: SignedInContext): Promise<MemberAccess> {
  const organizationId = ctx.session.activeOrganizationId;
  const access = organizationId ? await ctx.identity.resolveAccess(ctx.user.id, organizationId) : null;
  if (!access) throw new DomainError("FORBIDDEN", "NOT_A_MEMBER", "You are not a member of an organization");
  const step = pendingStep(access);
  if (step === "CHANGE_PASSWORD") throw new DomainError("FORBIDDEN", step, "Choose a new password first");
  if (step === "SET_UP_TWO_FACTOR") throw new DomainError("FORBIDDEN", step, "Set up two-factor sign-in first");
  return access;
}

/** Check 4: the member's role holds every listed permission. */
function assertHolds(member: MemberAccess, required: readonly Permission[]): void {
  const missing = member.permissions.missing(required);
  if (missing.length > 0) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", `Requires ${missing.join(", ")}`);
  }
}

type RequiredPermissions = [Permission, ...Permission[]];

const member = protectedProcedure.use(async ({ ctx, next }) => next({ ctx: { member: await memberAccessFor(ctx) } }));
const freshMember = freshlySignedIn.use(async ({ ctx, next }) => next({ ctx: { member: await memberAccessFor(ctx) } }));

/** Any member of the session's organization. `.requires("leads:create")` adds check 4. */
export const orgProcedure = Object.assign(member, {
  requires: (...permissions: RequiredPermissions) =>
    member.use(({ ctx, next }) => {
      assertHolds(ctx.member, permissions);
      return next();
    }),
});

/** Like orgProcedure, but the session is read from the database: for money, roles, exports, staff management and two-factor settings. */
export const freshProcedure = Object.assign(freshMember, {
  requires: (...permissions: RequiredPermissions) =>
    freshMember.use(({ ctx, next }) => {
      assertHolds(ctx.member, permissions);
      return next();
    }),
});

/** Platform staff only (spec 6.1): user role "admin" and no membership, on a session read from the database. */
export const platformProcedure = freshlySignedIn.use(async ({ ctx, next }) => {
  if (!(await ctx.identity.isPlatformAdmin(ctx.user))) {
    throw new DomainError("FORBIDDEN", "PLATFORM_ONLY", "Only platform staff can do this");
  }
  return next();
});
