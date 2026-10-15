// How a staff member is shown: by what they sign in with, never by the placeholder address that staff without email
// carry (ADR 0006; lib/shown-email.ts).
import type { StaffMember } from "@travel-crm/contracts/identity";
import { shownEmail } from "@/lib/shown-email";

/** The email when there is a real one, else the username, else nothing. */
export function signInName(member: Pick<StaffMember, "email" | "username">): string {
  return shownEmail(member.email) ?? member.username ?? "";
}

/** What to give a person to sign in with when handing over their details: the username if they have one (with the
 * organization code), else a real email. A placeholder address is never shown. */
export function handoverSignInName(member: Pick<StaffMember, "email" | "username">): string | null {
  return member.username ?? shownEmail(member.email);
}

/** The staff list with one person's role replaced: what the screen shows while the change is on its way. */
export function withRole(staff: StaffMember[], memberId: string, role: StaffMember["role"]): StaffMember[] {
  return staff.map((member) => (member.memberId === memberId ? { ...member, role } : member));
}
