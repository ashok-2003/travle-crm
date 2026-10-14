// Better Auth, configured for this product (ADR 0006): sign-in by email or by organization code and username,
// database sessions with a 5-minute cookie cache, two-factor, platform admins and impersonation. No self sign-up.
import type { IdentityClient } from "@travel-crm/db/identity";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { username } from "better-auth/plugins/username";
import { hasEverBeenMember, isPlatformAdminUser } from "../access.js";
import { INTERNAL_USERNAME_PATTERN } from "../sign-in-names.js";
import { relabelTotpForStaffWithoutEmail } from "./totp-label.js";

export interface AuthSettings {
  /** The product name authenticator apps show next to the code. */
  appName: string;
  /** BETTER_AUTH_SECRET: signs and encrypts cookies and two-factor secrets. At least 32 characters. */
  secret: string;
  /** BETTER_AUTH_URL: where browsers reach the api, e.g. https://app.example.in. */
  baseUrl: string;
  /** Other origins allowed to send requests with cookies, e.g. the web app's address in development. */
  trustedOrigins: readonly string[];
  /** HTTPS-only cookies with the __Secure- prefix. Always on in production. */
  secureCookies: boolean;
  /** Sign-in rate limiting (spec 6.2). Turned off only in tests that sign in many times. */
  rateLimit: boolean;
  /** Headers the load balancer puts the client's IP address in. Rate limits are counted per IP. */
  ipAddressHeaders: readonly string[];
}

const DAY = 60 * 60 * 24;

export function createAuth(client: IdentityClient, settings: AuthSettings) {
  return betterAuth({
    appName: settings.appName,
    secret: settings.secret,
    baseURL: settings.baseUrl,
    trustedOrigins: [...settings.trustedOrigins],
    database: prismaAdapter(client, { provider: "postgresql" }),
    advanced: {
      // Prisma makes the ids: uuid v7, from @default(uuid(7)) in the schema.
      database: { generateId: false },
      useSecureCookies: settings.secureCookies,
      ipAddress: { ipAddressHeaders: [...settings.ipAddressHeaders] },
      // Better Auth skips its origin check when NODE_ENV is "test" or TEST is set. Pinned on, so tests prove the same
      // protection production gets and a stray environment variable can't switch it off.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    emailAndPassword: {
      enabled: true,
      // Staff are created by their organization's admins through our API (spec 6.1).
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      onPasswordReset: async ({ user }) => {
        await clearMustChangePassword(client, user.id);
      },
    },
    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY,
      // Most requests are checked from this signed, encrypted cookie, so the session row is read at most once every
      // 5 minutes per device. Sensitive procedures skip it (spec 6.4).
      cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "jwe" },
    },
    databaseHooks: {
      session: {
        create: {
          // One user, one organization: put it on the session so requests don't look it up.
          before: async (session) => ({
            data: { ...session, activeOrganizationId: await organizationOf(client, session.userId) },
          }),
        },
      },
      account: {
        update: {
          after: async (account, context) => {
            if (context?.path === "/change-password") await clearMustChangePassword(client, account.userId);
          },
        },
      },
    },
    hooks: { before: closeSideDoors(client), after: relabelTotpForStaffWithoutEmail(client) },
    rateLimit: { enabled: settings.rateLimit, storage: "memory" },
    plugins: [
      username({
        // "<org code>:<username>": 3-12 characters, a colon, 2-32 characters.
        minUsernameLength: 6,
        maxUsernameLength: 45,
        usernameValidator: (value) => INTERNAL_USERNAME_PATTERN.test(value),
      }),
      organization({
        // Better Auth's organization `slug` is our `code` column. Clients can't reach the plugin's endpoints:
        // the api blocks /api/auth/organization/*, and members are managed through our own API.
        schema: { organization: { fields: { slug: "code" } } },
        allowUserToCreateOrganization: false,
      }),
      // Platform staff have user role "admin". Support may impersonate a user for at most an hour (spec 6.1).
      admin({ adminRoles: ["admin"], impersonationSessionDuration: 60 * 60 }),
      twoFactor({ issuer: settings.appName }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The organization of a user's active membership, or null for platform staff and removed members. */
async function organizationOf(client: IdentityClient, userId: string): Promise<string | null> {
  const member = await client.member.findUnique({ where: { userId }, select: { organizationId: true } });
  return member?.organizationId ?? null;
}

async function clearMustChangePassword(client: IdentityClient, userId: string): Promise<void> {
  await client.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
}

/**
 * Refuses what Better Auth's own endpoints would allow but our rules don't (ADR 0006):
 * - a member rewriting their username into another organization's namespace (only our staff API changes usernames),
 *   and probing which usernames exist;
 * - /admin/* for anyone who isn't platform staff by our definition (Better Auth checks user.role alone), and
 *   making a person with a membership a platform admin;
 * - a "password change" to the same password, which would clear must-change-password and keep the temporary one.
 */
function closeSideDoors(client: IdentityClient) {
  return createAuthMiddleware(async (ctx) => {
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    if (ctx.path === "/update-user" && ("username" in body || "displayUsername" in body)) {
      throw new APIError("FORBIDDEN", {
        code: "USERNAME_CHANGES_NOT_ALLOWED",
        message: "Ask an administrator to change your username",
      });
    }
    if (ctx.path === "/is-username-available") {
      throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: "Not found" });
    }
    if (ctx.path === "/change-password" && body.newPassword === body.currentPassword) {
      throw new APIError("BAD_REQUEST", {
        code: "NEW_PASSWORD_MUST_DIFFER",
        message: "Choose a password different from the current one",
      });
    }
    if (ctx.path.startsWith("/admin/")) {
      // The cookie cache is skipped: a demoted admin must lose access at once.
      const session = await getAuthoritativeSessionFromCtx(ctx);
      if (!session) throw new APIError("UNAUTHORIZED", { code: "UNAUTHORIZED", message: "Sign in first" });
      if (!(await isPlatformAdminUser(client, session.user.id))) {
        throw new APIError("FORBIDDEN", { code: "FORBIDDEN", message: "Platform staff only" });
      }
      const roles = [body.role].flat();
      if (ctx.path === "/admin/set-role" && roles.includes("admin") && typeof body.userId === "string") {
        if (await hasEverBeenMember(client, body.userId)) {
          throw new APIError("FORBIDDEN", {
            code: "MEMBERS_CANNOT_BE_PLATFORM_STAFF",
            message: "A person with a membership can't be platform staff",
          });
        }
      }
    }
  });
}
