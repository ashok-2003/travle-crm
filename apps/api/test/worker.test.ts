// The api and the worker together, end to end (spec 2.6: every shared service used at least once): a quotation with
// GST is issued, the worker renders its PDF into S3 (MinIO) once, a customer opens it through a share link, the agent
// who shared it is told in the bell and by email from our address with the agency's Reply-To, and a webhook is
// processed once however often it arrives. The worker also forgets a removed member's browsers and keeps the daily
// rate-limit purge. Real Postgres, real pg-boss, real MinIO; email and push in memory.
import { createHmac, randomUUID } from "node:crypto";
import { getIssuedDocument, issueDocument, sampleQuotation } from "@travel-crm/domain/documents";
import { startWorker, type Worker } from "@travel-crm/domain/jobs";
import { money } from "@travel-crm/domain/kernel";
import { savePushSubscription } from "@travel-crm/domain/notifications";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createShareLink } from "@travel-crm/domain/share-links";
import { hmacSha256Signature, type StoredWebhookEvent, type WebhookProvider } from "@travel-crm/domain/webhooks";
import { createMemoryEmailSender, senderNameFor, type MemoryEmailSender } from "@travel-crm/integrations/email";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { createS3Storage } from "@travel-crm/integrations/storage";
import { extractText } from "unpdf";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { workerJobs, type WorkerJobs } from "../src/worker-jobs.js";
import { startMinio, type TestMinio } from "./support/minio.js";
import { ownerAccess } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";

/** Asks until the answer passes, for work the worker does in the background. */
async function eventually<T>(ask: () => Promise<T> | T, passes: (answer: T) => boolean, what: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const answer = await ask();
    if (passes(answer)) return answer;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const webhookSecret = "worker-test-secret";
const processedWebhooks: string[] = [];
const exampleProvider: WebhookProvider = {
  name: "example",
  keptHeaders: ["x-example-signature"],
  verify: hmacSha256Signature({ secret: webhookSecret, header: "x-example-signature", encoding: "hex" }),
  identify: ({ rawBody }) => ({ eventId: (JSON.parse(rawBody) as { id: string }).id, eventType: "example.sent" }),
  process: (event: StoredWebhookEvent) => {
    processedWebhooks.push(event.providerEventId);
    return Promise.resolve();
  },
};

describe("the api and the worker, end to end", () => {
  /** Everything the worker and pg-boss reported: nothing should go wrong in this flow. */
  const reported: string[] = [];
  let minio: TestMinio;
  let jobs: PgBossJobs;
  let email: MemoryEmailSender;
  let server: TestServer;
  let agency: TestAgency;
  let work: WorkerJobs;
  let worker: Worker;

  beforeAll(async () => {
    minio = await startMinio();
    jobs = createPgBossJobs({
      connectionString: inject("dbUrls").runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      retryPolicy: { retryLimit: 1, retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
      onError: (error) => reported.push(`pg-boss: ${error.message}`),
    });
    await jobs.start();
    server = createTestServer(
      {},
      { storage: createS3Storage(minio.settings), queue: jobs, webhookProviders: [exampleProvider] },
    );
    agency = await createTestAgency(server);
    // issueDocument reads the organization's zone; Reply-To is its contact address.
    await server.platform.organization.update({
      where: { id: agency.organizationId },
      data: { contactEmail: "hello@sharma.example", timeZone: "Asia/Kolkata" },
    });
    email = createMemoryEmailSender();
    work = workerJobs({
      db: server.db,
      identity: server.identity,
      files: server.files,
      email,
      push: createMemoryPushSender(),
      appUrl: "https://app.example.in",
      webhookProviders: [exampleProvider],
      log: (line) => reported.push(line),
    });
    worker = await startWorker({
      db: server.db,
      runner: jobs,
      queue: jobs,
      ...work,
      // Only this file's organization: other test files share the database.
      relay: { intervalMs: 100, organizationIds: [agency.organizationId] },
      onError: (error) => reported.push(`relay: ${String(error)}`),
    });
  }, 180_000);

  afterAll(async () => {
    await worker.stop();
    await jobs.stop();
    await server.close();
    await minio.stop();
    expect(reported).toEqual([]);
  });

  it("renders an issued quotation once, opens it through a share link, and tells the agent who shared it", async () => {
    const owner = await ownerAccess(server, agency);
    const quotation = sampleQuotation({
      recipient: { name: "Meera Iyer", lines: ["Mumbai 400002"] },
      supplierStateCode: "27",
      placeOfSupplyStateCode: "27",
      lines: [
        {
          description: "Andaman islands, 6 nights",
          // Tour operator services.
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
    );

    const link = await server.db.forOrg(agency.organizationId, (tx) =>
      createShareLink(tx, owner, {
        recordType: "issued_document",
        recordId: document.id,
        label: `Quotation ${document.number}`,
      }),
    );
    const opened = await server.app.request(link.path, { headers: { "x-forwarded-for": "203.0.113.20" } });
    expect(opened.status).toBe(302);
    const download = await fetch(opened.headers.get("location") ?? "");
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain(`${document.number}.pdf`);
    const { text } = await extractText(new Uint8Array(await download.arrayBuffer()), { mergePages: true });
    expect(text).toContain(document.number);
    expect(text).toContain("SAC 998555");
    expect(text).toContain("₹12,50,000.00");
    expect(text).toContain("CGST 2.5 %");
    expect(text).toContain("SGST 2.5 %");
    expect(text).toContain("₹31,250.00");
    expect(text).toContain("₹13,12,500.00");

    const notice = await eventually(
      () => email.sent.find((message) => message.subject === `Opened: Quotation ${document.number}`),
      (message) => message !== undefined,
      "the email to the agent",
    );
    expect(notice).toMatchObject({
      to: { address: agency.owner.email },
      fromName: senderNameFor("Test agency"),
      replyTo: "hello@sharma.example",
    });
    const bell = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.notification.findMany({ where: { recipientUserId: agency.owner.userId } }),
    );
    expect(bell.map((notification) => notification.title)).toEqual([`Opened: Quotation ${document.number}`]);

    // Rendered once: the PDF the customer opened is the one attachment the document has.
    const attachments = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.attachment.findMany({ where: { recordType: "issued_document", recordId: document.id } }),
    );
    expect(attachments.map((attachment) => attachment.id)).toEqual([rendered.pdfAttachmentId]);
    // Ids only: job errors are cut down before pg-boss keeps them, so the list's entries are what matter, not text.
    expect((await jobs.failedJobs()).map((job) => job.queue)).toEqual([]);
  });

  it("processes a webhook once, however often the provider delivers it", async () => {
    const eventId = `evt_${randomUUID()}`;
    const body = JSON.stringify({ id: eventId });
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
    const deliver = () =>
      server.app.request("/webhooks/example", {
        method: "POST",
        headers: { "x-example-signature": signature, "x-forwarded-for": "192.0.2.30" },
        body,
      });
    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    await eventually(
      () => processedWebhooks.filter((id) => id === eventId).length,
      (count) => count > 0,
      "processing",
    );
    // Long enough for a second job to have run, had the repeat queued one.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(processedWebhooks.filter((id) => id === eventId)).toEqual([eventId]);
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
    expect(await jobs.schedules()).toContainEqual({
      queue: "rate-limits.purge",
      cron: "30 3 * * *",
      timeZone: "Asia/Kolkata",
    });
    const keySecret = "worker-test-rate-limit-secret-of-32-bytes";
    const rule = { limit: 1, windowSeconds: 60 };
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const key = `worker-test:${randomUUID()}`;
    expect((await createRateLimiter(server.db, { keySecret }).hit(key, rule, twoDaysAgo)).allowed).toBe(true);
    const purge = work.schedules.find((schedule) => schedule.queue === "rate-limits.purge");
    await purge?.handle({});
    // The old window is gone, so a new limiter counts that window from nothing again.
    expect((await createRateLimiter(server.db, { keySecret }).hit(key, rule, twoDaysAgo)).allowed).toBe(true);
  });
});
