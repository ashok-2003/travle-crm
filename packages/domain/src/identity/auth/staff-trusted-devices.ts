// Platform staff never keep a trusted device (ADR 0025). Better Auth's two-factor plugin lets anyone who ticks "trust
// this device" skip the code for 30 days, renewed at every sign-in, and the platform's accounts reach every
// organization's data, so for them the request is ignored, and a trust set before they became staff lapses.
import type { IdentityClient } from "@travel-crm/db/identity";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { isPlatformAdminUser } from "../access.js";

/** The endpoints that take `trustDevice` (better-auth 1.7.7, plugins/two-factor/{totp,backup-codes,otp}/index.mjs). */
const VERIFY_PATHS: readonly string[] = [
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/verify-otp",
];

/** The sign-ins after which the plugin looks for a trusted device: the same list as its own (index.mjs:245-247). */
const SIGN_IN_PATHS: readonly string[] = ["/sign-in/email", "/sign-in/username", "/sign-in/phone-number"];

/** The cookie that names the sign-in waiting for its code (plugins/two-factor/constant.mjs). */
const TWO_FACTOR_COOKIE = "two_factor";

/**
 * Every trusted device is a verification row with this prefix, valued with the user's id (verify-two-factor.mjs:49),
 * stored plain because create-auth.ts's storeIdentifier hashes only reset tokens.
 */
const TRUSTED_DEVICE_PREFIX = "trust-device-";

/**
 * A Better Auth plugin, listed before twoFactor() so its after hook runs first:
 * - before the code is checked, a platform staff member's `trustDevice: true` becomes false. Better Auth sets the trust
 *   only from the body (verify-two-factor.mjs:41-56), for the user the signed two_factor cookie names
 *   (verify-two-factor.mjs:15-22), which is read here the same way. Ignored, not refused: the challenge screen can't
 *   know who is signing in.
 * - after a password sign-in, a platform staff member's trusted devices are deleted, so the plugin's own after hook
 *   finds no row for the browser's trust cookie, expires the cookie and asks for the code (index.mjs:251-275).
 */
export function noTrustedDevicesForStaff(client: IdentityClient): BetterAuthPlugin {
  return {
    id: "no-trusted-devices-for-staff",
    hooks: {
      before: [
        {
          matcher: (context) => VERIFY_PATHS.includes(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const body = (ctx.body ?? {}) as Record<string, unknown>;
            if (body.trustDevice !== true) return;
            const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
            const challenge = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
            if (!challenge) return;
            const pending = await ctx.context.internalAdapter.findVerificationValue(challenge);
            if (!pending || !(await isPlatformAdminUser(client, pending.value))) return;
            return { context: { body: { ...body, trustDevice: false } } };
          }),
        },
      ],
      after: [
        {
          matcher: (context) => SIGN_IN_PATHS.includes(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const user = ctx.context.newSession?.user;
            if (!user || !(await isPlatformAdminUser(client, user.id))) return;
            await client.verification.deleteMany({
              where: { value: user.id, identifier: { startsWith: TRUSTED_DEVICE_PREFIX } },
            });
          }),
        },
      ],
    },
  };
}
