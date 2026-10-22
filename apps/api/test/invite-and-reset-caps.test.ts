// Invites and plan 3's password resets are capped apart (ADR 0022). Anyone may ask for resets to an address, so three
// anonymous requests, the reset's whole hour, must not keep an Owner's invite from going out. Both run on one rate
// limiter, as services.ts gives the api and the worker.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { asOrganization, createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createOrganizationRecord, insertStarterRoles, inviteOwner } from "@travel-crm/domain/identity";
import { runListenerJob } from "@travel-crm/domain/jobs";
import { platformActor } from "@travel-crm/domain/kernel";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { passwordResetEmails } from "../src/password-reset-email.js";
import { tracked } from "./support/password-reset.js";
import { createTestServer, ORIGIN, postJson, type TestServer } from "./support/test-server.js";

const HOUR = 60 * 60 * 1000;

describe("the invite and reset caps", () => {
  const resetEmails = createMemoryEmailSender();
  const inviteEmails = createMemoryEmailSender();
  /** One instant, in one hour's window, for every count, so they can't straddle two windows. */
  const at = new Date(Math.floor(Date.now() / HOUR) * HOUR + 60_000);
  let limiterDb: Database;
  let platformDb: PlatformDatabase;
  let limiter: Pick<RateLimiter, "hit">;
  let resets: ReturnType<typeof tracked>;
  let server: TestServer;

  beforeAll(() => {
    const urls = inject("dbUrls");
    limiterDb = createDatabase(urls.runtime, { maxConnections: 2 });
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    const shared = createRateLimiter(limiterDb, { keySecret: "invite-and-reset-caps-test-secret-32-bytes" });
    limiter = { hit: (key, rule) => shared.hit(key, rule, at) };
    resets = tracked(passwordResetEmails(resetEmails, limiter, createMemoryLogger()));
    server = createTestServer({ passwordReset: { sendEmail: resets.send, pageUrl: `${ORIGIN}/reset-password` } });
  });

  afterAll(async () => {
    await resets.settled();
    await server.close();
    await platformDb.disconnect();
    await limiterDb.disconnect();
  });

  /** An organization onboarded as the console does it, its Owner invited by email with no password yet. */
  async function onboardedOwner() {
    const code = `C${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    const email = `owner-${code.toLowerCase()}@example.test`;
    const organizationId = await platformDb.transaction(async (tx) => {
      const organization = await createOrganizationRecord(tx, {
        name: "Malabar Tours",
        code,
        timeZone: "Asia/Kolkata",
        contactEmail: null,
      });
      await asOrganization(tx, organization.id, async (orgTx) => {
        await insertStarterRoles(orgTx);
        await inviteOwner(orgTx, platformActor(organization.id, randomUUID()), { name: "Fathima Rahman", email });
      });
      return organization.id;
    });
    return { organizationId, email };
  }

  it("still sends the Owner's invite after three anonymous reset requests for their address", async () => {
    const { organizationId, email } = await onboardedOwner();
    // Four anonymous requests: the reset's cap lets three emails through, so the fourth sends nothing.
    for (let request = 0; request < 4; request += 1) {
      const answer = await postJson(server, "/api/auth/request-password-reset", {
        email,
        redirectTo: `${ORIGIN}/reset-password`,
      });
      expect(answer.status).toBe(200);
    }
    await resets.settled();
    expect(resetEmails.sent.filter((message) => message.to.address === email)).toHaveLength(3);

    const event = await server.db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: "staff.invited" } }),
    );
    await runListenerJob({
      db: server.db,
      listener: server.identity.inviteListener({ email: inviteEmails, appUrl: ORIGIN, limiter, now: () => at }),
      data: { organizationId, eventId: event.id, eventType: event.type },
    });
    expect(inviteEmails.sent.map((message) => message.to.address)).toEqual([email]);
  });
});
