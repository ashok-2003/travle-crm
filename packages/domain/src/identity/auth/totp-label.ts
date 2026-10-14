// Authenticator apps label a code with the account name in the two-factor setup link. Better Auth uses the email;
// for staff without email that is a placeholder, which is never shown, so we label it "<ORG CODE> <username>".
import type { IdentityClient } from "@travel-crm/db/identity";
import { createAuthMiddleware } from "better-auth/api";
import { isPlaceholderEmail } from "../sign-in-names.js";

/** Replaces a placeholder email in an otpauth:// link's label. Other links come back unchanged. */
export async function relabelTotpUri(client: IdentityClient, totpUri: string): Promise<string> {
  // otpauth://totp/<issuer>:<account>?secret=...
  const label = decodeURIComponent(new URL(totpUri).pathname.slice(1));
  const account = label.slice(label.indexOf(":") + 1);
  if (!isPlaceholderEmail(account)) return totpUri;
  const user = await client.user.findUnique({
    where: { email: account },
    select: { displayUsername: true, member: { select: { organization: { select: { code: true } } } } },
  });
  const name = [user?.member?.organization.code, user?.displayUsername].filter(Boolean).join(" ") || "Staff";
  return totpUri.replace(`:${encodeURIComponent(account)}`, `:${encodeURIComponent(name)}`);
}

/** Better Auth hook: relabels the link returned by the two-factor setup endpoints. */
export function relabelTotpForStaffWithoutEmail(client: IdentityClient) {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/two-factor/enable" && ctx.path !== "/two-factor/get-totp-uri") return;
    const returned = ctx.context.returned as { totpURI?: unknown } | undefined;
    if (typeof returned?.totpURI !== "string") return;
    return ctx.json({ ...returned, totpURI: await relabelTotpUri(client, returned.totpURI) });
  });
}
