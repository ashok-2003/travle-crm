// Who opens the installed app (the home-screen app) on which kind of phone, so their browser on that kind of phone can say
// "open Veeper from your home screen": Safari can't tell whether the app is installed. A time and the phone type only.
import type { InstalledAppPlatform } from "@travel-crm/contracts/usage";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long a visit still counts: the person is taken to use the installed app on that phone type. */
const REMEMBERED_DAYS = 30;

/**
 * Notes that the member opened the installed app on this phone type. It writes at most once a day for each member and
 * type: a visit within a day of the stored one changes nothing. Support impersonating the member is not their visit.
 */
export async function recordInstalledAppVisit(
  tx: OrgTx,
  access: MemberAccess,
  platform: InstalledAppPlatform,
  now: Date = new Date(),
): Promise<void> {
  if (access.impersonatedBy !== null) return;
  const stale = new Date(now.getTime() - DAY_MS);
  const moved = await tx.memberInstalledApp.updateMany({
    where: { userId: access.userId, platform, lastSeenAt: { lte: stale } },
    data: { lastSeenAt: now },
  });
  // Nothing to move: either the row is fresh (done) or there is none yet (a repeat of this one is skipped).
  if (moved.count === 0) {
    await tx.memberInstalledApp.createMany({
      data: [{ userId: access.userId, platform, lastSeenAt: now }],
      skipDuplicates: true,
    });
  }
}

/** The phone types the member opened the installed app on in the last 30 days. */
export async function installedAppPlatforms(
  tx: OrgTx,
  access: MemberAccess,
  now: Date = new Date(),
): Promise<InstalledAppPlatform[]> {
  const since = new Date(now.getTime() - REMEMBERED_DAYS * DAY_MS);
  const rows = await tx.memberInstalledApp.findMany({
    where: { userId: access.userId, lastSeenAt: { gte: since } },
    select: { platform: true },
    orderBy: { platform: "asc" },
  });
  return rows.flatMap(({ platform }) => (platform === "ios" || platform === "android" ? [platform] : []));
}
