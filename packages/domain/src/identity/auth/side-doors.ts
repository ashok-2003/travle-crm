// A Better Auth hooks.before middleware that refuses what Better Auth's own endpoints would allow but our rules don't.
import { features } from "@travel-crm/contracts/features";
import type { IdentityClient } from "@travel-crm/db/identity";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import {
  describePlatformStaff,
  hasEverBeenMember,
  isActiveMemberUser,
  isPlatformAdminUser,
  memberPendingStep,
  platformStaffLevelOf,
} from "../access.js";

/**
 * The admin endpoints that stay open over HTTP: support's impersonation, which the console starts and stops through
 * Better Auth. Every other one is closed: the console has its own API, and some would skip our rules (remove-user
 * deletes a user outright, past soft delete; set-user-password skips must-change-password).
 */
const adminPathsOpenOverHttp: readonly string[] = ["/admin/impersonate-user", "/admin/stop-impersonating"];

export interface SideDoorOptions {
  /** The web app's reset page: the only redirectTo a password-reset request may name. Unset, the rule is off. */
  resetPasswordPage?: string | undefined;
}

/**
 * Refuses what Better Auth's own endpoints would allow but our rules don't (ADR 0006):
 * - a member rewriting their username into another organization's namespace (only our staff API changes usernames),
 *   and probing which usernames exist;
 * - /admin/* over HTTP, except starting and stopping support's impersonation;
 * - /admin/* for anyone who isn't platform staff by our definition (Better Auth checks user.role alone), still has a
 *   temporary password to replace or hasn't set up two-factor (while features.twoFactor is on), making a person with
 *   a membership a platform admin, and impersonating anyone but an organization's active staff, or one with a step
 *   still to take (a temporary password, or two-factor their organization requires), which needs their own password;
 * - Better Auth's organization endpoints over HTTP (members and roles go through our own API);
 * - signing in by a placeholder ".invalid" email, which staff without an email (or removed staff) carry, over HTTP and
 *   from server-side calls alike;
 * - a cross-site browser request to the username sign-in, as Better Auth already checks Origin for email sign-in;
 * - a "password change" to the same password, which would clear must-change-password and keep the temporary one;
 * - a password-reset request whose link would lead anywhere but the reset page, even on a trusted origin. It is
 *   refused before any address is looked up, exactly as Better Auth refuses an untrusted redirect, so every address
 *   gets the same answer. This binds server-side auth.api.requestPasswordReset calls too: code that sends someone a
 *   reset link must pass the reset page as redirectTo.
 */
export function closeSideDoors(client: IdentityClient, options: SideDoorOptions = {}) {
  return createAuthMiddleware(async (ctx) => {
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    // Over HTTP a request is present; server-side auth.api.* calls have none.
    const overHttp = ctx.request !== undefined;
    if (overHttp && ctx.path.startsWith("/admin/") && !adminPathsOpenOverHttp.includes(ctx.path)) {
      throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: "Not found" });
    }
    if (overHttp && ctx.path.startsWith("/organization/")) {
      // The Hono route closes this first. Server-side calls stay possible, so later plans can use the plugin from code.
      throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: "Not found" });
    }
    if (ctx.path === "/sign-in/username" && ctx.request?.headers.get("sec-fetch-site") === "cross-site") {
      throw new APIError("FORBIDDEN", { code: "FORBIDDEN", message: "Cross-site sign-in is not allowed" });
    }
    if (ctx.path === "/sign-in/email" && typeof body.email === "string" && /\.invalid$/i.test(body.email.trim())) {
      // Exactly Better Auth's answer to a wrong password, so nothing tells this case apart.
      throw new APIError("UNAUTHORIZED", { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
    }
    if (
      ctx.path === "/request-password-reset" &&
      options.resetPasswordPage !== undefined &&
      body.redirectTo !== options.resetPasswordPage
    ) {
      // Better Auth's own refusal of an untrusted redirectTo, word for word.
      throw new APIError("FORBIDDEN", { message: "Invalid redirectURL", code: "INVALID_REDIRECT_URL" });
    }
    if (ctx.path === "/update-user" && ("username" in body || "displayUsername" in body)) {
      throw new APIError("FORBIDDEN", {
        code: "USERNAME_CHANGES_NOT_ALLOWED",
        message: "Ask an administrator to change your username",
      });
    }
    if (ctx.path === "/is-username-available") {
      throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: "Not found" });
    }
    if (ctx.path === "/change-password" && isSamePassword(body.newPassword, body.currentPassword)) {
      throw new APIError("BAD_REQUEST", {
        code: "NEW_PASSWORD_MUST_DIFFER",
        message: "Choose a password different from the current one",
      });
    }
    if (ctx.path.startsWith("/admin/")) {
      // The cookie cache is skipped: a demoted admin must lose access at once.
      const session = await getAuthoritativeSessionFromCtx(ctx);
      if (!session) throw new APIError("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Sign in first" });
      // During impersonation the session's user is the impersonated member; Better Auth restores the admin named in
      // impersonatedBy. That one path stays open, and only when that person is still platform staff.
      const impersonatedBy = (session.session as { impersonatedBy?: string | null }).impersonatedBy;
      const stoppingImpersonation =
        ctx.path === "/admin/stop-impersonating" &&
        !!impersonatedBy &&
        (await isPlatformAdminUser(client, impersonatedBy));
      if (!stoppingImpersonation) {
        const staff = await describePlatformStaff(client, session.user.id);
        if (!staff) throw new APIError("FORBIDDEN", { code: "FORBIDDEN", message: "Platform staff only" });
        // As in the console: a temporary password is replaced before anything else, impersonation included.
        if (staff.mustChangePassword) {
          throw new APIError("FORBIDDEN", { code: "CHANGE_PASSWORD", message: "Choose a new password first" });
        }
        // Then two-factor, also as in the console: the platform's accounts reach every organization's data.
        if (features.twoFactor && !staff.twoFactorEnabled) {
          throw new APIError("FORBIDDEN", { code: "SET_UP_TWO_FACTOR", message: "Set up two-factor sign-in first" });
        }
      }
      if (ctx.path === "/admin/impersonate-user") {
        // An impersonation nobody in an organization can see in their log must not start.
        const target = coercedString(body.userId);
        if (target === null || !(await isActiveMemberUser(client, target))) {
          throw new APIError("FORBIDDEN", {
            code: "IMPERSONATION_TARGET_NOT_A_MEMBER",
            message: "Only an organization's active staff can be impersonated",
          });
        }
        // The app would hold support at the step's screen, which only the member can get past.
        if ((await memberPendingStep(client, target)) !== null) {
          throw new APIError("FORBIDDEN", {
            code: "TARGET_HAS_PENDING_STEP",
            message: "They have to finish signing in themselves first",
          });
        }
      }
      if (await makesMemberPlatformAdmin(client, ctx.path, body)) {
        throw new APIError("FORBIDDEN", {
          code: "MEMBERS_CANNOT_BE_PLATFORM_STAFF",
          message: "A person with a membership can't be platform staff",
        });
      }
    }
  });
}

/** Better Auth hashes passwords after NFKC normalization, so look-alikes ("１" for "1") are the same password. */
function isSamePassword(newPassword: unknown, currentPassword: unknown): boolean {
  if (typeof newPassword !== "string" || typeof currentPassword !== "string") return false;
  return newPassword.normalize("NFKC") === currentPassword.normalize("NFKC");
}

/**
 * Whether an /admin request would give a platform role (support's "admin" or "super-admin") to a person who has (or
 * had) a membership. Mirrors how Better Auth reads the request: the user id is coerced to a string, and a role string
 * may hold several roles, comma-joined.
 */
async function makesMemberPlatformAdmin(
  client: IdentityClient,
  path: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  let requested: unknown;
  if (path === "/admin/set-role") requested = body.role;
  else if (path === "/admin/update-user") requested = (body.data as { role?: unknown } | null | undefined)?.role;
  else return false;
  const roles = (coercedString(requested) ?? "").split(",").map((role) => role.trim());
  const userId = coercedString(body.userId);
  if (!roles.some((role) => platformStaffLevelOf(role) !== null) || userId === null) return false;
  return hasEverBeenMember(client, userId);
}

/** An id or role the way Better Auth reads it: arrays become their elements joined by commas. Used for both. */
function coercedString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (Array.isArray(value)) return value.map((item: unknown) => coercedString(item) ?? "").join(",");
  return null;
}
