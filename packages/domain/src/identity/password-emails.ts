// The rules every email with a link to choose a password follows, the invite (spec 7.1) and plan 3's password reset
// (spec 6.2) alike: how many one address gets, the page the link opens, and who may still be invited.
import type { IdentityTx } from "@travel-crm/db/identity";
import type { RateLimitRule } from "../rate-limits/index.js";

/**
 * Password emails one address gets at most: three an hour, invites and resets together, counted in Postgres so every
 * process counts against the same limit. It stops anyone filling one person's inbox with working links.
 */
export const PASSWORD_EMAILS_PER_RECIPIENT: RateLimitRule = { limit: 3, windowSeconds: 60 * 60 };

/** The rate-limit key of one recipient's password emails. Plan 3 named it for resets; invites share it. */
export function passwordEmailRecipientKey(address: string): string {
  return `password-reset-recipient:${address.toLowerCase()}`;
}

/** The web app's reset page under APP_URL, path kept: where invite and reset links lead. */
export function resetPasswordPageOf(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/reset-password`;
}

/**
 * True once the person has a password: they chose one from an invite, or an admin set one. An invite is only for
 * someone who has none yet; anyone else resets theirs, within the reset's hour.
 */
export async function hasChosenPassword(tx: IdentityTx, userId: string): Promise<boolean> {
  return (await tx.account.count({ where: { userId, providerId: "credential", password: { not: null } } })) > 0;
}
