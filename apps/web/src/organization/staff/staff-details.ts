// How a staff member is shown: by what they sign in with, never by the placeholder address that staff without email
// carry (ADR 0006). The api never sends one; it is checked here too, because showing one would leak it.
import type { StaffMember } from "@travel-crm/contracts/identity";

const isPlaceholder = (email: string) => email.toLowerCase().endsWith(".invalid");

/** The email when there is a real one, else the username, else nothing. */
export function signInName(member: Pick<StaffMember, "email" | "username">): string {
  if (member.email !== null && !isPlaceholder(member.email)) return member.email;
  return member.username ?? "";
}

/** The staff list with one person's role replaced: what the screen shows while the change is on its way. */
export function withRole(staff: StaffMember[], memberId: string, role: StaffMember["role"]): StaffMember[] {
  return staff.map((member) => (member.memberId === memberId ? { ...member, role } : member));
}
