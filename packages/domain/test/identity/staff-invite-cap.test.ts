// The invite's own cap (ADR 0021): five invite emails an hour to one address, every attempt counted, apart from plan 3's
// resets. Past it the job fails with our own message, and the failed jobs keep it: an invite never ends quietly. The
// listener runs on a memory job runner, registered as the worker registers it, with pg-boss's retries.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createMemoryEmailSender, type EmailSender } from "@travel-crm/integrations/email";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { runListenerJob } from "../../src/jobs/index.js";
import { createRateLimiter, type RateLimiter } from "../../src/rate-limits/index.js";
import { invitedJobs, inviteAgain, invitedOwner } from "./invites.js";
import { createTestIdentity, type TestIdentity } from "./test-identity.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("the invite's cap", () => {
  let platformDb: PlatformDatabase;
  let db: Database;
  let test: TestIdentity;
  let limiter: RateLimiter;
  /** One instant, in one hour's window, so the counts can't straddle two windows. */
  const now = new Date(Math.floor(Date.now() / HOUR) * HOUR + MINUTE);

  beforeAll(() => {
    const urls = inject("dbUrls");
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    test = createTestIdentity();
    limiter = createRateLimiter(db, { keySecret: "staff-invite-cap-test-secret-of-32-bytes" });
  });

  afterAll(async () => {
    await test.close();
    await db.disconnect();
    await platformDb.disconnect();
  });

  /** The worker's side: the listener on its queue, sending through `email`, and a way to run the latest invite. */
  async function inviteWorker(email: EmailSender) {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const listener = test.identity.inviteListener({ email, appUrl: "https://app.example.in", limiter, now: () => now });
    await runner.work(listener.name, async (job) => {
      await runListenerJob({ db, listener, data: job.data });
    });
    return {
      runner,
      /** Queues the organization's latest staff.invited event, as the relay would, and runs it with its retries. */
      async deliverLatest(organizationId: string) {
        const data = (await invitedJobs(db, organizationId)).at(-1);
        if (!data) throw new Error("No staff.invited event");
        await queue.send(listener.name, data);
        await runner.runQueued();
      },
    };
  }

  const capError = (memberId: string) =>
    `InviteCapReachedError: Invite to member ${memberId} not sent: its address has had 5 invite attempts this hour. ` +
    "Retry the job later.";

  it("sends five invites an hour to one address; the sixth fails, and stays in the failed jobs", async () => {
    const email = createMemoryEmailSender();
    const worker = await inviteWorker(email);
    const { organizationId, owner } = await invitedOwner(platformDb);
    await worker.deliverLatest(organizationId);
    for (let again = 0; again < 5; again += 1) {
      await inviteAgain(platformDb, organizationId, owner.memberId);
      await worker.deliverLatest(organizationId);
    }
    expect(email.sent).toHaveLength(5);
    // Retried as any failed job, and still over the cap each time.
    expect(worker.runner.failed).toEqual([expect.objectContaining({ attempts: 6, error: capError(owner.memberId) })]);
    // The refused invite stored no link.
    expect(await test.database.client.verification.count({ where: { value: owner.userId } })).toBe(5);
  });

  it("counts every attempt, so a send that keeps failing ends in the failed jobs, not lost", async () => {
    let tries = 0;
    const down: EmailSender = {
      send: () => {
        tries += 1;
        return Promise.reject(new Error("connect ECONNREFUSED"));
      },
    };
    const worker = await inviteWorker(down);
    const { organizationId, owner } = await invitedOwner(platformDb);
    await worker.deliverLatest(organizationId);
    // Five sends fail and use up the hour; the last retry finds the cap and fails too, visibly.
    expect(tries).toBe(5);
    expect(worker.runner.failed).toEqual([expect.objectContaining({ attempts: 6, error: capError(owner.memberId) })]);
  });
});
