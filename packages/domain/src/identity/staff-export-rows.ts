// The active staff as the staff export lists them (B52): oldest first, as the Staff screen lists them, with the role's
// name, an email only when it isn't a placeholder, and the days on the agency's clock. Names and addresses never leave
// identity except through this one list, for the export.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { calendarDateIn, type CalendarDate } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";
import { organizationTimeZone } from "./organization-profile.js";
import { shownEmail } from "./sign-in-names.js";

export interface StaffExportRow {
  name: string;
  username: string | null;
  email: string | null;
  /** In E.164. */
  phone: string | null;
  roleName: string;
  joinedOn: CalendarDate;
  mustChangePassword: boolean;
  /** The day of their last request, accurate to a day; null before their first. */
  lastActiveOn: CalendarDate | null;
}

export async function staffExportRows(database: IdentityDatabase, actor: MemberAccess): Promise<StaffExportRow[]> {
  return database.forOrg(actor.organizationId, async (tx) => {
    const zone = await organizationTimeZone(tx, actor.organizationId);
    // The member table has no row-level security, so the organization is filtered here; soft delete hides removals.
    const members = await tx.member.findMany({
      where: { organizationId: actor.organizationId },
      include: { user: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const roles = new Map(
      (await tx.role.findMany({ select: { key: true, name: true } })).map((role) => [role.key, role.name]),
    );
    return members.map((member) => ({
      name: member.user.name,
      username: member.user.displayUsername,
      email: shownEmail(member.user.email),
      phone: member.phoneE164,
      roleName: roles.get(member.role) ?? member.role,
      joinedOn: calendarDateIn(member.createdAt, zone),
      mustChangePassword: member.user.mustChangePassword,
      lastActiveOn: member.lastActiveAt === null ? null : calendarDateIn(member.lastActiveAt, zone),
    }));
  });
}
