// Better Auth, configured for this product (ADR 0006): sign-in by email or by organization code and username,
// database sessions with a 5-minute cookie cache, two-factor, platform admins and impersonation, which the audit log
// records. No self sign-up.
import type { IdentityClient, IdentityDatabase } from "@travel-crm/db/identity";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { username } from "better-auth/plugins/username";
import { INTERNAL_USERNAME_PATTERN } from "../sign-in-names.js";
import { impersonationAudit } from "./impersonation-audit.js";
import { passwordResetSender, RESET_LINK_SECONDS, type PasswordResetSettings } from "./password-reset.js";
import { closeSideDoors } from "./side-doors.js";
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
  /** Sign-in rate limiting (spec 6.2). Turned off only in development and tests. */
  rateLimit: boolean;
  /** Headers the load balancer puts the client's IP address in. Rate limits are counted per IP. */
  ipAddressHeaders: readonly string[];
  /**
   * IPs or CIDR ranges of the proxies in front of the api. Better Auth reads the client address from the right of
   * x-forwarded-for, skipping these. Empty: the header is trusted only when it holds a single address.
   */
  trustedProxies: readonly string[];
  /** Password reset by email: the sender and the reset page. Without it, Better Auth answers "Reset password isn't enabled". */
  passwordReset?: PasswordResetSettings | undefined;
}

const DAY = 60 * 60 * 24;

export function createAuth(database: IdentityDatabase, settings: AuthSettings) {
  const client = database.client;
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
      ipAddress: {
        ipAddressHeaders: [...settings.ipAddressHeaders],
        trustedProxies: [...settings.trustedProxies],
      },
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
      // Whoever had the old password is signed out everywhere: a reset usually means it was lost or stolen.
      revokeSessionsOnPasswordReset: true,
      // Set here rather than left to the library's default.
      resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
      ...(settings.passwordReset === undefined
        ? {}
        : { sendResetPassword: passwordResetSender(settings.passwordReset.sendEmail) }),
    },
    verification: {
      // A reset link's token is kept only as a hash, so the table can't be read for a working link.
      storeIdentifier: { default: "plain", overrides: { "reset-password:": "hashed" } },
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
    hooks: {
      before: closeSideDoors(client, { resetPasswordPage: settings.passwordReset?.pageUrl }),
      after: relabelTotpForStaffWithoutEmail(client),
    },
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
      // Writes "support.impersonation-started" and "-stopped" to the member's organization's audit log.
      impersonationAudit(database),
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
