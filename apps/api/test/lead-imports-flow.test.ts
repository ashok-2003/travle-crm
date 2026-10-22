// A lead import through the worker, end to end (bulk plan, Task 1.5): the CSV goes to MinIO by its presigned upload,
// the worker reads it, the importer matches the columns, the worker checks it and, on Add, adds it, makes the report
// and tells the owners. Real Postgres, pg-boss and MinIO.
import type { ImportDetail, StartedImport } from "@travel-crm/contracts/imports";
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { startWorker, type Worker } from "@travel-crm/domain/jobs";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { createPgBossJobs, type PgBossJobs } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { createS3Storage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { logWorkerProblem } from "../src/worker-problem.js";
import { problemLogger } from "./support/problem-logger.js";
import { workerJobs } from "../src/worker-jobs.js";
import { eventually } from "./support/eventually.js";
import { startMinio, type TestMinio } from "./support/minio.js";
import { addStaff, signedInOwner } from "./support/people.js";
import type { CookieJar } from "./support/cookie-jar.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query } from "./support/trpc.js";

const CSV = [
  "Name,Phone,Email,Destination,Owner,Status",
  "Asha Rao,98765 43210,asha@example.com,Goa,Zara,Called",
  "Ravi Kumar,98765 43211,,Kerala,Zara,",
  "Asha Rao,98765 43210,,Spiti,Zara,",
  ",98765 43213,,Goa,,",
].join("\n");

/**
 * The api and a worker on a database of this file's own, so another file's worker, on the shared database's pg-boss
 * queues, never takes this import's jobs with its own storage.
 */
interface Flow {
  server: TestServer;
  agency: TestAgency;
}

describe("a lead import through the worker", () => {
  const reported: string[] = [];
  let isolated: IsolatedDatabase | undefined;
  let minio: TestMinio | undefined;
  let jobs: PgBossJobs | undefined;
  let server: TestServer | undefined;
  let worker: Worker | undefined;
  let flow: Flow;
  let owner: CookieJar;
  let zara: string;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    minio = await startMinio();
    jobs = createPgBossJobs({
      connectionString: isolated.urls.runtime,
      maxConnections: 3,
      pollingIntervalSeconds: 0.5,
      retryPolicy: { retryLimit: 1, retryDelaySeconds: 1, retryDelayMaxSeconds: 1 },
      logger: problemLogger(reported),
    });
    await jobs.start();
    server = createTestServer({}, { storage: createS3Storage(minio.settings), queue: jobs, dbUrls: isolated.urls });
    const agency = await createTestAgency(server);
    await server.platform.organization.update({
      where: { id: agency.organizationId },
      data: { timeZone: "Asia/Kolkata" },
    });
    flow = { server, agency };
    const work = workerJobs({
      db: server.db,
      identity: server.identity,
      files: server.files,
      spreadsheets: server.spreadsheets,
      subscriptions: server.subscriptions,
      seatLimit: server.seatLimit,
      email: createMemoryEmailSender(),
      push: createMemoryPushSender(),
      appUrl: "https://app.example.in",
      webhookProviders: [],
      rateLimiter: createRateLimiter(server.db, { keySecret: "lead-import-flow-rate-limit-secret-of-32-bytes" }),
      logger: problemLogger(reported),
    });
    worker = await startWorker({
      db: server.db,
      runner: jobs,
      queue: jobs,
      ...work,
      relay: { intervalMs: 100, organizationIds: [agency.organizationId] },
      onError: logWorkerProblem(problemLogger(reported)),
    });
    owner = await signedInOwner(server, agency);
    zara = (await addStaff(server, agency, { username: "zara", roleKey: "sales" })).userId;
  }, 180_000);

  afterAll(async () => {
    await worker?.stop();
    await jobs?.stop();
    await server?.close();
    await minio?.stop();
    await isolated?.drop();
    expect(reported).toEqual([]);
  });

  it("uploads a CSV, reads it, matches, checks and adds it through the worker", async () => {
    const { server, agency } = flow;
    const detail = (importId: string) =>
      query(server, "leadImports.get", owner, { importId }).then((response) => dataOf<ImportDetail>(response));
    const started = await dataOf<StartedImport>(
      await mutate(
        server,
        "leadImports.start",
        { fileName: "enquiries-oct-2026.csv", contentType: "text/csv", sizeBytes: CSV.length },
        owner,
      ),
    );
    const sent = await fetch(started.upload.url, {
      method: started.upload.method,
      headers: started.upload.headers,
      body: CSV,
    });
    expect(sent.ok).toBe(true);
    await dataOf(await mutate(server, "leadImports.confirmUpload", { importId: started.importId }, owner));

    const read = await eventually(
      () => detail(started.importId),
      (found) => found.status === "matching",
      "the file to be read",
      30_000,
    );
    expect(read.columns.map((column) => column.field)).toEqual([
      "name",
      "phone",
      "email",
      "destination",
      "owner",
      "stage",
    ]);
    expect(read.valueMatches.find((match) => match.field === "owner" && match.value === "Zara")).toMatchObject({
      target: zara,
      matchedBy: "name",
    });
    await dataOf(
      await mutate(
        server,
        "leadImports.match",
        {
          importId: started.importId,
          columns: read.columns.map((column) => ({ position: column.position, field: column.field })),
          values: [],
          defaults: { stage: "new", ownerUserId: null, budgetBasis: null },
        },
        owner,
      ),
    );
    const checked = await eventually(
      () => detail(started.importId),
      (found) => found.status === "checked",
      "the check",
      30_000,
    );
    expect(checked.counts?.byPlan).toMatchObject({ new: 2, enquiry: 1, not_added: 1 });

    await dataOf(await mutate(server, "leadImports.add", { importId: started.importId }, owner));
    const done = await eventually(
      () => detail(started.importId),
      (found) => found.status === "done",
      "the add",
      60_000,
    );
    expect(done.progress.rowsAdded).toBe(3);
    expect(done.report).not.toBeNull();

    const leads = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.lead.findMany({ include: { person: true }, orderBy: { id: "asc" } }),
    );
    expect(leads.map((lead) => [lead.person.name, lead.source, lead.stage, lead.ownerUserId])).toEqual([
      ["Asha Rao", "bulk_upload", "contacted", zara],
      ["Ravi Kumar", "bulk_upload", "new", zara],
    ]);
    expect(await server.db.forOrg(agency.organizationId, (tx) => tx.leadEnquiry.count())).toBe(1);
    const notices = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.notification.findMany({ where: { kind: { in: ["import.finished", "lead.imported"] } } }),
    );
    expect(notices.map((notice) => [notice.kind, notice.recipientUserId, notice.title]).sort()).toEqual([
      ["import.finished", agency.owner.userId, "Your import is done"],
      ["lead.imported", zara, "2 leads from an import are now yours"],
    ]);
    const link = await dataOf<{ url: string }>(
      await mutate(server, "leadImports.reportLink", { importId: started.importId }, owner),
    );
    const report = await (await fetch(link.url)).text();
    expect(report).toContain("Why it wasn't added");
    expect(report).toContain("No name");
  }, 150_000);
});
