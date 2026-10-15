// The invite email (spec 7.1): the worker's identity.send-invite listener emails a link that lets the invited person
// choose a password through Better Auth's reset and then sign in. Nobody removed, banned, without a real address or
// with a password by then is emailed; the link works for 72 hours; and an address gets at most three password emails
// an hour, invites and plan 3's resets together.
import { randomUUID } from "node:crypto";
import { createDatabase, softDeleted, type Database } from "@travel-crm/db";
import { asOrganization, createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createOrganizationRecord,
  insertStarterRoles,
  inviteOwner,
  requestInvite,
  type CreatedStaff,
} from "../../src/identity/index.js";
import { runListenerJob } from "../../src/jobs/index.js";
import { platformActor } from "../../src/kernel/index.js";
import { createRateLimiter, type RateLimiter } from "../../src/rate-limits/index.js";
import { createTestIdentity, signInByEmail, type TestIdentity } from "./test-identity.js";

/** With a path, as APP_URL may have: the link keeps it. */
const appUrl = "https://app.example.in/crm/";
const contactEmail = "hello@kerala-trails.example";
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("the invite email", () => {
  let platformDb: PlatformDatabase;
  let db: Database;
  let test: TestIdentity;
  let limiter: RateLimiter;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    test = createTestIdentity();
    limiter = createRateLimiter(db, { keySecret: "staff-invites-test-secret-of-32-bytes" });
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
        contactEmail,
      });
      const owner = await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        return inviteOwner(orgTx, platformActor(organization.id, randomUUID()), { name: "Lakshmi Nair", email });
      });
      return { organizationId: organization.id, owner, email };
    });
  }

  /** Asks for another invite, as the console's resendInvite does. */
  const inviteAgain = (organizationId: string, memberId: string) =>
    platformDb.transaction((tx) =>
      asOrganization(tx, organizationId, (orgTx) =>
        requestInvite(orgTx, platformActor(organizationId, randomUUID()), memberId),
      ),
    );

  const invitedEvents = (organizationId: string) =>
    db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "staff.invited" }, orderBy: { id: "asc" } }),
    );

  /** Runs the invite listener at `now` on a staff.invited event, the latest unless `first`, as the worker would. */
  async function deliverInvite(organizationId: string, { now = new Date(), first = false } = {}) {
    const email = createMemoryEmailSender();
    const events = await invitedEvents(organizationId);
    const event = first ? events[0] : events.at(-1);
    if (!event) throw new Error("No staff.invited event");
    const listener = test.identity.inviteListener({ email, appUrl, limiter, now: () => now });
    await runListenerJob({ db, listener, data: { organizationId, eventId: event.id, eventType: event.type } });
    return email.sent;
  }

  const tokenIn = (text: string | undefined) => /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(text ?? "")?.[1] ?? "";
  const choosePassword = (token: string, newPassword: string) =>
    test.identity.auth.api.resetPassword({ body: { token, newPassword } });

  it("emails the Owner, for their agency, a link with which they choose a password and then sign in", async () => {
    const { organizationId, email } = await invitedOwner();
    const [message, ...others] = await deliverInvite(organizationId);
    expect(others).toEqual([]);
    expect(message).toMatchObject({
      to: { name: "Lakshmi Nair", address: email },
      subject: "Your account for Kerala Trails",
      replyTo: contactEmail,
    });
    expect(message?.fromName).toMatch(/^Kerala Trails via /);
    expect(message?.text).toContain("https://app.example.in/crm/reset-password?token=");
    const token = tokenIn(message?.text);
    // Kept only as a hash, as Better Auth keeps its reset tokens (ADR 0006): the table holds no working link.
    expect(await test.database.client.verification.count({ where: { identifier: { contains: token } } })).toBe(0);
    await choosePassword(token, "my-own-password-1");
    const signedIn = await signInByEmail(test.identity, email, "my-own-password-1");
    expect(signedIn.get("cookie")).toBeTruthy();
  });

  it("emails nobody removed, banned, or with a password since; a ban that has ended no longer counts", async () => {
    const removed = await invitedOwner();
    await test.database.client.member.update({
      where: { id: removed.owner.memberId },
      data: softDeleted(randomUUID()),
    });
    expect(await deliverInvite(removed.organizationId)).toEqual([]);

    const banned = await invitedOwner();
    await test.database.client.user.update({ where: { id: banned.owner.userId }, data: { banned: true } });
    expect(await deliverInvite(banned.organizationId)).toEqual([]);

    const banEnded = await invitedOwner();
    await test.database.client.user.update({
      where: { id: banEnded.owner.userId },
      data: { banned: true, banExpires: new Date(Date.now() - MINUTE) },
    });
    expect(await deliverInvite(banEnded.organizationId)).toHaveLength(1);

    // Two invites asked for; the first one's link sets a password before the second is sent.
    const chosen = await invitedOwner();
    await inviteAgain(chosen.organizationId, chosen.owner.memberId);
    const [message] = await deliverInvite(chosen.organizationId, { first: true });
    await choosePassword(tokenIn(message?.text), "chosen-password-1");
    expect(await deliverInvite(chosen.organizationId)).toEqual([]);
  });

  it("refuses another invite once the person has a password: they reset it instead", async () => {
    const { organizationId, owner } = await invitedOwner();
    const [message] = await deliverInvite(organizationId);
    await choosePassword(tokenIn(message?.text), "chosen-password-2");
    await expect(inviteAgain(organizationId, owner.memberId)).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "PASSWORD_ALREADY_SET",
    });
  });

  it("keeps the link working for 72 hours, well past a reset link's hour, and not after", async () => {
    const choosingWithLinkSentAgo = async (milliseconds: number) => {
      const { organizationId } = await invitedOwner();
      const [message] = await deliverInvite(organizationId, { now: new Date(Date.now() - milliseconds) });
      return choosePassword(tokenIn(message?.text), "in-time-password-1");
    };
    await expect(choosingWithLinkSentAgo(61 * MINUTE)).resolves.toMatchObject({ status: true });
    await expect(choosingWithLinkSentAgo(71 * HOUR)).resolves.toMatchObject({ status: true });
    await expect(choosingWithLinkSentAgo(72 * HOUR + MINUTE)).rejects.toMatchObject({
      body: { code: "INVALID_TOKEN" },
    });
  });

  it("counts invites with the address's password resets, three an hour, and skips the rest unsaid", async () => {
    // One instant, in one hour's window, so the counts can't straddle two windows.
    const now = new Date(Math.floor(Date.now() / HOUR) * HOUR + MINUTE);
    const { organizationId, owner, email } = await invitedOwner();
    // Two reset emails this hour, counted under plan 3's key for the address.
    for (let reset = 0; reset < 2; reset++) {
      await limiter.hit(`password-reset-recipient:${email}`, { limit: 3, windowSeconds: 60 * 60 }, now);
    }
    expect(await deliverInvite(organizationId, { now })).toHaveLength(1);
    await inviteAgain(organizationId, owner.memberId);
    expect(await deliverInvite(organizationId, { now })).toEqual([]);
    // Over the cap no token is stored either: the one link sent is the only one.
    expect(await test.database.client.verification.count({ where: { value: owner.userId } })).toBe(1);
  });
});
