// A lead import through the worker, end to end (bulk plan, Task 1.5): the CSV goes to MinIO by its presigned upload,
// the worker reads it, the importer matches the columns, the worker checks it and, on Add, adds it, makes the report
// and tells the owners. Real Postgres, pg-boss and MinIO.
import type { ImportDetail, StartedImport } from "@travel-crm/contracts/imports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventually } from "./support/eventually.js";
import { addStaff, signedInOwner } from "./support/people.js";
import type { CookieJar } from "./support/cookie-jar.js";
import { dataOf, mutate, query } from "./support/trpc.js";
import { countingWebhookProvider } from "./support/webhook-provider.js";
import { startWorkerFlow, stopWorkerFlow, type Running, type WorkerFlow } from "./support/worker-flow.js";

const CSV = [
  "Name,Phone,Email,Destination,Owner,Status",
  "Asha Rao,98765 43210,asha@example.com,Goa,Zara,Called",
  "Ravi Kumar,98765 43211,,Kerala,Zara,",
  "Asha Rao,98765 43210,,Spiti,Zara,",
  ",98765 43213,,Goa,,",
].join("\n");

describe("a lead import through the worker", () => {
  const reported: string[] = [];
  const running: Running = {};
  let flow: WorkerFlow;
  let owner: CookieJar;
  let zara: string;

  beforeAll(async () => {
    flow = await startWorkerFlow(running, reported, countingWebhookProvider("lead-import-flow-secret"));
    owner = await signedInOwner(flow.server, flow.agency);
    zara = (await addStaff(flow.server, flow.agency, { username: "zara", roleKey: "sales" })).userId;
  }, 180_000);

  afterAll(async () => {
    await stopWorkerFlow(running);
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
