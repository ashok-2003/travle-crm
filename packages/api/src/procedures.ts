// The procedure builders. Each request runs the checks of spec 6.5 in order:
//   1 signed in → 2 organization active → 3 module on the plan → 4 role permission → handler.
// Checks 2 and 3 come with the member (memberAccessFor): check 3 for the module every organization procedure declares
// in its meta, and again in requires() for its permissions' modules, before check 4. Check 5 (own or all records) is
// the handler's, through scopeFilter(); check 6 is Postgres row-level security.
import { TRPCError } from "@trpc/server";
import { moduleOf, pendingStep, type Identity, type MemberAccess, type Permission } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import {
  assertLifecycleAllows,
  assertModulesOnPlan,
  assertOnPlan,
  planModuleOf,
  type CallKind,
  type Entitlements,
  type ProcedureModule,
  type SubscriptionAccess,
} from "@travel-crm/domain/subscriptions";
import { forwardCookies } from "./context.js";
import { domainErrorsAsStatus } from "./errors.js";
import { t, type ProcedureMeta } from "./trpc.js";

/** Every procedure turns domain errors into their HTTP status. */
const base = t.procedure.use(domainErrorsAsStatus);

export const publicProcedure = base;

interface SessionContext {
  identity: Identity;
  headers: Headers;
  resHeaders: Headers;
}

/** The session read from the database, ignoring the cookie cache, or null when it is gone. */
async function sessionFromDatabase(ctx: SessionContext) {
  const { headers, response } = await ctx.identity.auth.api.getSession({
    headers: ctx.headers,
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
  forwardCookies(headers, ctx.resHeaders);
  return response;
}

/**
 * Support's impersonation must end the moment its session does: when the admin stops, the hour is up, or the admin
 * is no longer platform staff (their impersonation sessions are deleted with their access). So an impersonation
 * session is always read from the database, never from the 5-minute cookie cache, and its admin re-checked.
 */
async function assertImpersonationStillHolds(
  ctx: SessionContext,
  session: { impersonatedBy?: string | null | undefined },
): Promise<void> {
  if (!session.impersonatedBy) return;
  const { impersonatedBy } = session;
  if (!(await ctx.identity.isPlatformAdmin({ id: impersonatedBy }))) throw new TRPCError({ code: "UNAUTHORIZED" });
}

/**
 * Check 1, from the session cookie. Cached for up to 5 minutes, so a revoked session still passes for that long,
 * except an impersonation session, which is read from the database every time.
 */
export const protectedProcedure = base.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!ctx.session.impersonatedBy) return next({ ctx: { session: ctx.session, user: ctx.user } });
  const fresh = await sessionFromDatabase(ctx);
  if (!fresh?.session.impersonatedBy) throw new TRPCError({ code: "UNAUTHORIZED" });
  await assertImpersonationStillHolds(ctx, fresh.session);
  return next({ ctx: { session: fresh.session, user: fresh.user } });
});

/** Check 1 against the database, ignoring the cookie cache: a revoked session stops at once (spec 6.4). */
const freshlySignedIn = base.use(async ({ ctx, next }) => {
  const fresh = await sessionFromDatabase(ctx);
  if (!fresh) throw new TRPCError({ code: "UNAUTHORIZED" });
  await assertImpersonationStillHolds(ctx, fresh.session);
  return next({ ctx: { session: fresh.session, user: fresh.user } });
});

interface SignedInContext {
  identity: Identity;
  subscriptions: SubscriptionAccess;
  session: { activeOrganizationId?: string | null | undefined; impersonatedBy?: string | null | undefined };
  user: { id: string };
}

interface Call {
  /** What the call does, for check 2. */
  kind: CallKind;
  /** The plan module it belongs to, for check 3. */
  planModule: ProcedureModule;
}

/**
 * What a call does, for check 2 (a query views, a mutation changes, unless the procedure says otherwise), and its
 * plan module, for check 3. A procedure that declares no module is a bug: it fails closed, never skipping check 3.
 */
function callOf(type: string, meta: ProcedureMeta | undefined): Call {
  const planModule = meta?.planModule;
  if (planModule === undefined) {
    throw new Error("This organization procedure declares no plan module: use requires(), or meta planModule");
  }
  if (meta?.lifecycle === "always") return { kind: "always", planModule };
  if (meta?.lifecycle === "export") return { kind: "export", planModule };
  return { kind: type === "query" ? "view" : "change", planModule };
}

/**
 * The member's access in the session's organization, read from the database on every request, so a removal or role
 * change applies to the next request. Members with a password change or two-factor setup still to do are refused
 * here; the endpoints they need for it (Better Auth's /change-password and /two-factor/*, and me.get) stay open.
 * The session's impersonatedBy goes with the access, so whatever support does while impersonating is recorded as such.
 * The member's last activity is noted, then check 2, what the organization's subscription allows today, and check 3
 * for the procedure's own module.
 */
async function memberAccessFor(
  ctx: SignedInContext,
  call: Call,
): Promise<{ member: MemberAccess; entitlements: Entitlements | null }> {
  const organizationId = ctx.session.activeOrganizationId;
  const session = { impersonatedBy: ctx.session.impersonatedBy ?? null };
  const access = organizationId ? await ctx.identity.resolveAccess(ctx.user.id, organizationId, session) : null;
  if (!access) throw new DomainError("FORBIDDEN", "NOT_A_MEMBER", "You are not a member of an organization");
  const step = pendingStep(access);
  if (step === "CHANGE_PASSWORD") throw new DomainError("FORBIDDEN", step, "Choose a new password first");
  if (step === "SET_UP_TWO_FACTOR") throw new DomainError("FORBIDDEN", step, "Set up two-factor sign-in first");
  // The member is using the app, whatever the subscription allows today: one indexed UPDATE, matching no row on most
  // requests (it writes once a day), and none during support's impersonation.
  await ctx.identity.recordActivity(access);
  const entitlements = await ctx.subscriptions.entitlementsOf(access.organizationId);
  assertLifecycleAllows(entitlements, { kind: call.kind, isOwner: access.role.isOwner });
  assertOnPlan(entitlements, [call.planModule]);
  return { member: access, entitlements };
}

/** Checks 3 and 4 for required permissions: their modules are on the plan, then the role holds every one. */
function assertMayUse(member: MemberAccess, entitlements: Entitlements | null, required: readonly Permission[]): void {
  assertModulesOnPlan(entitlements, required.map(moduleOf));
  const missing = member.permissions.missing(required);
  if (missing.length > 0) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", `Requires ${missing.join(", ")}`);
  }
}

type RequiredPermissions = [Permission, ...Permission[]];

/** The plan module of a procedure that requires these permissions: its first one's, or core for the Foundation's. */
function planModuleOfPermissions(permissions: RequiredPermissions): ProcedureModule {
  return planModuleOf(moduleOf(permissions[0])) ?? "core";
}

const member = protectedProcedure.use(async ({ ctx, type, meta, next }) =>
  next({ ctx: await memberAccessFor(ctx, callOf(type, meta)) }),
);
const freshMember = freshlySignedIn.use(async ({ ctx, type, meta, next }) =>
  next({ ctx: await memberAccessFor(ctx, callOf(type, meta)) }),
);

/**
 * Any member of the session's organization. `.requires("leads:create")` declares the procedure's plan module and adds
 * checks 3 and 4; without permissions, declare it: `.meta({ planModule: "core" })` for the Foundation's own.
 */
export const orgProcedure = Object.assign(member, {
  requires: (...permissions: RequiredPermissions) =>
    member.meta({ planModule: planModuleOfPermissions(permissions) }).use(({ ctx, next }) => {
      assertMayUse(ctx.member, ctx.entitlements, permissions);
      return next();
    }),
});

/** Like orgProcedure, but the session is read from the database: for money, roles, exports, staff management and two-factor settings. */
export const freshProcedure = Object.assign(freshMember, {
  requires: (...permissions: RequiredPermissions) =>
    freshMember.meta({ planModule: planModuleOfPermissions(permissions) }).use(({ ctx, next }) => {
      assertMayUse(ctx.member, ctx.entitlements, permissions);
      return next();
    }),
});
