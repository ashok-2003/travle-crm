// The api and the worker together, end to end (spec 2.6: every shared service used at least once): a quotation with
// GST is issued, the worker renders its PDF into S3 (MinIO) once, a customer opens it through a share link, the agent
// who shared it is told in the bell and by one email from our address with the agency's Reply-To, and a webhook is
// processed once however often it arrives. The worker also forgets a removed member's browsers and keeps the daily
// rate-limit purge. Real Postgres, real pg-boss, real MinIO; email and push in memory.
import { randomUUID } from "node:crypto";
import { getIssuedDocument, issueDocument, sampleQuotation } from "@travel-crm/domain/documents";
import { listenerJobId } from "@travel-crm/domain/jobs";
import { money } from "@travel-crm/domain/kernel";
import { savePushSubscription } from "@travel-crm/domain/notifications";
import { createRateLimiter, RATE_LIMIT_PURGE_QUEUE } from "@travel-crm/domain/rate-limits";
import { createShareLink } from "@travel-crm/domain/share-links";
import { senderNameFor } from "@travel-crm/integrations/email";
import { extractText } from "unpdf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventually } from "./support/eventually.js";
import { ownerAccess } from "./support/people.js";
import type { TestAgency, TestServer } from "./support/test-server.js";
import { countingWebhookProvider } from "./support/webhook-provider.js";
import { startWorkerFlow, stopWorkerFlow, type Running, type WorkerFlow } from "./support/worker-flow.js";

const webhooks = countingWebhookProvider("worker-test-secret");

describe("the api and the worker, end to end", () => {
  /** Everything the worker and pg-boss reported: nothing should go wrong in this flow. */
  const reported: string[] = [];
  const running: Running = {};
  const startedAt = new Date();
  let flow: WorkerFlow;
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    flow = await startWorkerFlow(running, reported, webhooks);
    ({ server, agency } = flow);
  }, 180_000);

  afterAll(async () => {
    await stopWorkerFlow(running);
    expect(reported).toEqual([]);
  });

  it("renders an issued quotation once, opens it through a share link, and tells the agent who shared it", async () => {
    const owner = await ownerAccess(server, agency);
    const quotation = sampleQuotation({
      recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      // Tour operator services.
      lines: [
        {
          description: "Andaman islands, 6 nights",
          sacCode: "998555",
          taxableValue: money(12_50_000_00),
          rateBasisPoints: 500,
        },
      ],
      branding: { organizationName: "Sharma Holidays" },
    });
    const document = await server.db.forOrg(agency.organizationId, (tx) => issueDocument(tx, owner, quotation));
    const rendered = await eventually(
      () => server.db.forOrg(agency.organizationId, (tx) => getIssuedDocument(tx, { documentId: document.id })),
      (current) => current.pdfAttachmentId !== null,
      "the PDF to be rendered",
      20_000,
    );

    const label = `Quotation ${document.number}`;
    const link = await server.db.forOrg(agency.organizationId, (tx) =>
      createShareLink(tx, owner, { recordType: "issued_document", recordId: document.id, label }),
    );
    const opened = await server.app.request(link.path, { headers: { "x-forwarded-for": "203.0.113.20" } });
    expect(opened.status).toBe(302);
    const download = await fetch(opened.headers.get("location") ?? "");
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain(`${document.number}.pdf`);
    const { text } = await extractText(new Uint8Array(await download.arrayBuffer()), { mergePages: true });
    for (const printed of [document.number, "SAC 998555", "₹12,50,000.00", "CGST 2.5 %", "SGST 2.5 %", "₹31,250.00"]) {
      expect(text).toContain(printed);
    }
    expect(text).toContain("₹13,12,500.00");

    const bell = await eventually(
      () =>
        server.db.forOrg(agency.organizationId, (tx) =>
          tx.notification.findMany({ where: { recipientUserId: agency.owner.userId } }),
        ),
      (notifications) => notifications.length > 0,
      "the agent's notification",
      20_000,
    );
    expect(bell.map((notification) => notification.title)).toEqual([`Opened: ${label}`]);
    // Once its delivery job has completed, the agent has exactly one email: a retried delivery would send no second.
    const notificationId = bell[0]?.id ?? "";
    const delivery = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "notification.created", payload: { path: ["notificationId"], equals: notificationId } },
      }),
    );
    await eventually(
      () => flow.completed(listenerJobId("notifications.deliver", delivery.id)),
      Boolean,
      "the delivery",
    );
    const emails = flow.email.sent.filter((message) => message.subject === `Opened: ${label}`);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: { address: agency.owner.email },
      fromName: senderNameFor("Test agency"),
      replyTo: "hello@sharma.example",
    });

    // Rendered once: the PDF the customer opened is the one attachment the document has.
    const attachments = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.attachment.findMany({ where: { recordType: "issued_document", recordId: document.id } }),
    );
    expect(attachments.map((attachment) => attachment.id)).toEqual([rendered.pdfAttachmentId]);
    // Ids only: job errors are cut down before pg-boss keeps them, so the list's entries are what matter, not text.
    // Only this flow's queues, since this file started: other files run pg-boss on the same database at the same time.
    const queues = new Set([
      ...flow.work.listeners.map((listener) => listener.name),
      ...flow.work.handlers.map((handler) => handler.queue),
      ...flow.work.schedules.map((schedule) => schedule.queue),
    ]);
    const failed = (await flow.jobs.failedJobs()).filter(
      (job) => queues.has(job.queue) && job.failedAt !== null && job.failedAt >= startedAt,
    );
    expect(failed.map((job) => job.queue)).toEqual([]);
  }, 90_000);

  it("runs imports.read-file, the two lead import listeners, the two staff import listeners and both export listeners", () => {
    const names = flow.work.listeners.map((listener) => listener.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "imports.read-file",
        "crm.check-lead-import",
        "crm.add-lead-import",
        "imports.check-staff-import",
        "imports.add-staff-import",
        "crm.make-lead-export",
        "exports.make-staff-export",
      ]),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("processes a webhook once, however often the provider delivers it", async () => {
    const eventId = `evt_${randomUUID()}`;
    const body = JSON.stringify({ id: eventId });
    const deliver = () =>
      server.app.request("/webhooks/example", {
        method: "POST",
        headers: { "x-example-signature": webhooks.sign(body), "x-forwarded-for": "192.0.2.30" },
        body,
      });
    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    const stored = await server.platform.webhookEvent.findMany({
      where: { provider: "example", providerEventId: eventId },
    });
    expect(stored).toHaveLength(1);
    // The processing job's id is the stored event's: pg-boss queued the repeat's job once.
    await eventually(() => flow.completed(stored[0]?.id ?? ""), Boolean, "the webhook's processing job");
    expect(webhooks.processed.filter((id) => id === eventId)).toEqual([eventId]);
  });

  it("forgets a removed member's browsers once the removal reaches the worker", async () => {
    const owner = await ownerAccess(server, agency);
    const leaving = await server.identity.staff.create(owner, {
      name: "Leela",
      username: "leela",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-31",
    });
    await server.db.forOrg(agency.organizationId, (tx) =>
      savePushSubscription(
        tx,
        { organizationId: agency.organizationId, userId: leaving.userId, source: "web", impersonatedBy: null },
        {
          endpoint: `https://fcm.googleapis.com/fcm/send/leela-${randomUUID()}`,
          keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
        },
      ),
    );
    const browsers = () =>
      server.db.forOrg(agency.organizationId, (tx) => tx.pushSubscription.count({ where: { userId: leaving.userId } }));
    expect(await browsers()).toBe(1);
    await server.identity.staff.remove(owner, { memberId: leaving.memberId });
    await eventually(browsers, (count) => count === 0, "the removed member's browsers to be forgotten");
  });

  it("purges rate-limit windows over a day old, on a daily schedule", async () => {
    const purge = flow.work.schedules.find((schedule) => schedule.queue === RATE_LIMIT_PURGE_QUEUE);
    if (!purge) throw new Error(`The worker has no ${RATE_LIMIT_PURGE_QUEUE} schedule`);
    expect(await flow.jobs.schedules()).toContainEqual({
      queue: RATE_LIMIT_PURGE_QUEUE,
      cron: "30 3 * * *",
      timeZone: "Asia/Kolkata",
    });
    const limiter = () => createRateLimiter(server.db, { keySecret: "worker-test-rate-limit-secret-of-32-bytes" });
    const rule = { limit: 1, windowSeconds: 60 };
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const key = `worker-test:${randomUUID()}`;
    expect((await limiter().hit(key, rule, twoDaysAgo)).allowed).toBe(true);
    // The window is kept in the database, so even a new limiter counts it: a second hit in it is one too many.
    expect((await limiter().hit(key, rule, twoDaysAgo)).allowed).toBe(false);
    await purge.handle({});
    // The old window is gone, so that window counts from nothing again.
    expect((await limiter().hit(key, rule, twoDaysAgo)).allowed).toBe(true);
  });
});
