// The welcome (the owner, 2026-10-28): every member of a new organization sees it once, a video and a word about the
// product; an organization that came through the invite program also reads that it is one of the few invited, and its
// free days. Support impersonating a member neither sees it nor uses it up.
import type { Welcome } from "@travel-crm/contracts/usage";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** Only organizations made after the welcome came show it: older members never had one to see. */
const WELCOME_SINCE = new Date("2026-10-28T00:00:00Z");

export async function welcomeOf(tx: OrgTx, access: MemberAccess): Promise<Welcome> {
  const begun = await tx.organizationWelcome.findFirst({ select: { vip: true, trialDays: true, createdAt: true } });
  const seen = await tx.welcomeSeen.findFirst({ where: { userId: access.userId }, select: { id: true } });
  // An organization is new if it began through the invites, or its first audit entry (its onboarding) is recent.
  const first = await tx.auditEntry.findFirst({ orderBy: { occurredAt: "asc" }, select: { occurredAt: true } });
  const fresh = begun !== null || first === null || first.occurredAt >= WELCOME_SINCE;
  return {
    show: access.impersonatedBy === null && seen === null && fresh,
    vip: begun?.vip ?? false,
    trialDays: begun?.trialDays ?? null,
  };
}

export async function markWelcomeSeen(tx: OrgTx, access: MemberAccess): Promise<void> {
  if (access.impersonatedBy !== null) return;
  await tx.welcomeSeen.createMany({ data: [{ userId: access.userId }], skipDuplicates: true });
}

/** Marks a new organization's beginning, inside the step that made it: through the invite program, with its free days. */
export async function markOrganizationBegun(
  tx: OrgTx,
  begun: { vip: boolean; trialDays: number | null },
): Promise<void> {
  await tx.organizationWelcome.create({ data: begun });
}
