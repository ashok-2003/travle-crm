// Better Auth's admin ban, read one way everywhere: refused at sign-in, and by our own checks of who may act or be
// emailed. Removal bans with no end; a ban with an end that has passed no longer holds.

/** True while the ban holds: banned, with no end or an end still ahead. */
export function isBannedNow(
  user: { banned: boolean | null; banExpires: Date | null },
  now: Date = new Date(),
): boolean {
  return user.banned === true && (user.banExpires === null || user.banExpires > now);
}
