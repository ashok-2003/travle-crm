// Whether a member's save may also make a group package's departures: departures work, so they need the permission and the plan's module.
import type { MemberAccess } from "@travel-crm/domain/identity";
import type { Entitlements } from "@travel-crm/domain/subscriptions";

export function mayMakeDepartures(ctx: {
  member: Pick<MemberAccess, "permissions">;
  entitlements?: Entitlements | null;
}): boolean {
  return ctx.member.permissions.has("departures:create") && ctx.entitlements?.modules.has("departures") === true;
}
