// What the invite tests share: an organization onboarded with an invited Owner, as the console onboards one in one
// platform transaction; another invite asked for, as the console's resendInvite does; and the staff.invited events
// the worker's listener runs on.
import { randomUUID } from "node:crypto";
import type { Database } from "@travel-crm/db";
import { asOrganization, type PlatformDatabase } from "@travel-crm/db/platform";
import {
  createOrganizationRecord,
  insertStarterRoles,
  inviteOwner,
  requestInvite,
  type CreatedStaff,
} from "../../src/identity/index.js";
import { platformActor } from "../../src/kernel/index.js";

export interface InvitedOwner {
  organizationId: string;
  owner: CreatedStaff;
  email: string;
}

/** "Kerala Trails", with its first Owner invited by email and no password yet. */
export async function invitedOwner(
  platformDb: PlatformDatabase,
  contactEmail: string | null = null,
): Promise<InvitedOwner> {
  const code = `I${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
  const email = `owner-${code.toLowerCase()}@example.test`;
  return platformDb.transaction(async (tx) => {
    const organization = await createOrganizationRecord(tx, {
      name: "Kerala Trails",
      code,
      timeZone: "Asia/Kolkata",
      contactEmail,
    });
    const owner = await asOrganization(tx, organization.id, async (orgTx) => {
      await insertStarterRoles(orgTx);
      return inviteOwner(orgTx, platformActor(organization.id, randomUUID()), { name: "Lakshmi Nair", email });
    });
    return { organizationId: organization.id, owner, email };
  });
}

/** Asks for another invite. */
export function inviteAgain(platformDb: PlatformDatabase, organizationId: string, memberId: string): Promise<void> {
  return platformDb.transaction((tx) =>
    asOrganization(tx, organizationId, (orgTx) =>
      requestInvite(orgTx, platformActor(organizationId, randomUUID()), memberId),
    ),
  );
}

/** The organization's staff.invited events, oldest first, as the job data the relay would queue for each. */
export async function invitedJobs(db: Database, organizationId: string) {
  const events = await db.forOrg(organizationId, (tx) =>
    tx.outboxEvent.findMany({ where: { type: "staff.invited" }, orderBy: { id: "asc" } }),
  );
  return events.map((event) => ({ organizationId, eventId: event.id, eventType: event.type }));
}
