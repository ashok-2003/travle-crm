// What the invite (spec 7.1) takes from plan 3's password reset (spec 6.2): the page its link opens, built from APP_URL
// the same way, and who may still be invited rather than reset.
import type { IdentityTx } from "@travel-crm/db/identity";

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
