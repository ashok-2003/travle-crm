// The invite email (spec 7.1): the worker's identity.send-invite listener emails a link that lets the invited person
// choose a password through Better Auth's reset and then sign in; nobody removed or without a real address is
// emailed; the link lapses after 72 hours.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { asOrganization, createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createOrganizationRecord,
  INVITE_LINK_HOURS,
  insertStarterRoles,
  inviteOwner,
  type CreatedStaff,
} from "../../src/identity/index.js";
import { runListenerJob } from "../../src/jobs/index.js";
import { platformActor } from "../../src/kernel/index.js";
import { createTestIdentity, signInByEmail, type TestIdentity } from "./test-identity.js";

const appUrl = "https://app.example.in";

describe("the invite email", () => {
  let platformDb: PlatformDatabase;
  let db: Database;
  let test: TestIdentity;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    test = createTestIdentity();
  });

  afterAll(async () => {
    await test.close();
    await db.disconnect();
    await platformDb.disconnect();
  });

  async function invitedOwner(): Promise<{ organizationId: string; owner: CreatedStaff; email: string }> {
    const code = `I${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    const email = `owner-${code.toLowerCase()}@example.test`;
    return platformDb.transaction(async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: "Kerala Trails",
        code,
        timeZone: "Asia/Kolkata",
        contactEmail: null,
      });
      const owner = await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        return inviteOwner(orgTx, platformActor(organization.id, randomUUID()), { name: "Lakshmi Nair", email });
      });
      return { organizationId: organization.id, owner, email };
    });
  }

  /** Runs the invite listener on the organization's latest staff.invited event, as the worker would. */
  async function deliverInvite(organizationId: string, now?: Date) {
    const email = createMemoryEmailSender();
    const event = await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: "staff.invited" }, orderBy: { id: "desc" } }),
    );
    const listener = test.identity.inviteListener({ email, appUrl, ...(now ? { now: () => now } : {}) });
    await runListenerJob({ db, listener, data: { organizationId, eventId: event.id, eventType: event.type } });
    return email.sent;
  }

  const tokenIn = (text: string) => /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";

  it("emails the Owner a link with which they choose a password and then sign in", async () => {
    const { organizationId, email } = await invitedOwner();
    const [message, ...others] = await deliverInvite(organizationId);
    expect(others).toEqual([]);
    expect(message).toMatchObject({
      to: { name: "Lakshmi Nair", address: email },
      subject: "Your account for Kerala Trails",
    });
    expect(message?.fromName).toMatch(/^Kerala Trails via /);
    expect(message?.text).toContain(`${appUrl}/reset-password?token=`);
    const token = tokenIn(message?.text ?? "");
    // Kept only as a hash, as Better Auth keeps its reset tokens (ADR 0006): the table holds no working link.
    expect(await test.database.client.verification.count({ where: { identifier: { contains: token } } })).toBe(0);
    await test.identity.auth.api.resetPassword({ body: { token, newPassword: "my-own-password-1" } });
    const signedIn = await signInByEmail(test.identity, email, "my-own-password-1");
    expect(signedIn.get("cookie")).toBeTruthy();
  });

  it("emails nobody removed or banned since", async () => {
    const { organizationId, owner } = await invitedOwner();
    await test.database.client.user.update({ where: { id: owner.userId }, data: { banned: true } });
    expect(await deliverInvite(organizationId)).toEqual([]);
  });

  it("lets the link lapse after its hours", async () => {
    const { organizationId } = await invitedOwner();
    const sentLongAgo = new Date(Date.now() - (INVITE_LINK_HOURS + 1) * 60 * 60 * 1000);
    const [message] = await deliverInvite(organizationId, sentLongAgo);
    const token = tokenIn(message?.text ?? "");
    await expect(
      test.identity.auth.api.resetPassword({ body: { token, newPassword: "too-late-password-1" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
  });
});
