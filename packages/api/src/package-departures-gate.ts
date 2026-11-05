// Whether a member's save may also make a group package's departures: departures work, so they need the permission and the plan's module.
import { calendarDateIn } from "@travel-crm/domain/kernel";
import type { Identity, MemberAccess } from "@travel-crm/domain/identity";
import type { Entitlements } from "@travel-crm/domain/subscriptions";

export function mayMakeDepartures(ctx: {
  member: Pick<MemberAccess, "permissions">;
  entitlements?: Entitlements | null;
}): boolean {
  return ctx.member.permissions.has("departures:create") && ctx.entitlements?.modules.has("departures") === true;
}

/** Today in the agency's time zone, as a calendar day (the zone is Asia/Kolkata until the agency's profile says otherwise). */
export async function agencyToday(ctx: {
  identity: Pick<Identity, "organizationProfile">;
  member: Pick<MemberAccess, "organizationId">;
}): Promise<string> {
  const timeZone = (await ctx.identity.organizationProfile(ctx.member.organizationId))?.timeZone ?? "Asia/Kolkata";
  return calendarDateIn(new Date(), timeZone);
}
