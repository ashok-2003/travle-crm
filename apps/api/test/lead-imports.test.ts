// The lead import over HTTP (bulk plan, Task 1.5; spec 6.5): who may import, whose import it is, the steps in their
// order, the owner who can't work leads, and what a read-only agency may still do. The worker's listeners are run by
// hand, in order, on the agency's data; lead-imports-flow.test.ts runs them through the worker.
import { randomUUID } from "node:crypto";
import type { ImportDetail, StartedImport } from "@travel-crm/contracts/imports";
import { addLeadImportListener, checkLeadImportListener } from "@travel-crm/domain/crm";
import { readImportFileListener, type ImportJobDependencies } from "@travel-crm/domain/imports";
import type { DomainEvent, ListenerContext } from "@travel-crm/domain/jobs";
import { systemActor } from "@travel-crm/domain/kernel";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const CSV = "text/csv";
const ENQUIRIES = [
  "Name,Phone,Email,Destination",
  "Asha Rao,98765 43210,asha@example.com,Goa",
  "Ravi Kumar,98765 43211,,Kerala",
  "Meera Joshi,98765 43212,meera@example.com,Spiti",
].join("\n");

describe("the lead import over HTTP", () => {
  let server: TestServer;
  let storage: MemoryStorage;
  let agency: TestAgency;
  let owner: CookieJar;
  let admin: CookieJar;
  let salesperson: CookieJar;
  let jobs: ImportJobDependencies;

  beforeAll(async () => {
    storage = createMemoryStorage();
    server = createTestServer({}, { storage });
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    admin = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "priya", roleKey: "org-admin" }),
    );
    salesperson = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "zara", roleKey: "sales" }),
    );
    jobs = {
      files: server.files,
      spreadsheets: server.spreadsheets,
      identity: server.identity,
      subscriptions: server.subscriptions,
      seatLimit: server.seatLimit,
    };
  });

  afterAll(async () => {
    await server.close();
  });

  const context = (): ListenerContext => ({
    actor: systemActor(agency.organizationId),
    forOrg: (work) => server.db.forOrg(agency.organizationId, work),
  });
  const step = (type: string, importId: string): DomainEvent => ({
    id: randomUUID(),
    organizationId: agency.organizationId,
    type,
    // import.uploaded carries the id alone; the later steps name the kind too.
    payload: type === "import.uploaded" ? { importId } : { importId, kind: "leads" },
    occurredAt: new Date(),
  });
  const detail = (importId: string, jar = owner) =>
    query(server, "leadImports.get", jar, { importId }).then((response) => dataOf<ImportDetail>(response));

  /** Starts an import, sends the file as the browser would, and confirms it. */
  async function uploaded(jar: CookieJar, text = ENQUIRIES, fileName = "enquiries-oct-2026.csv"): Promise<string> {
    const started = await dataOf<StartedImport>(
      await mutate(server, "leadImports.start", { fileName, contentType: CSV, sizeBytes: text.length }, jar),
    );
    await storage.upload(
      { ...started.upload, expiresAt: new Date(started.upload.expiresAt) },
      new TextEncoder().encode(text),
      CSV,
    );
    await dataOf(await mutate(server, "leadImports.confirmUpload", { importId: started.importId }, jar));
    return started.importId;
  }
  /** Reads the file and returns the matches the reader guessed, ready to send back. */
  async function read(importId: string, jar = owner) {
    await readImportFileListener(jobs).handle(step("import.uploaded", importId), context());
    const found = await detail(importId, jar);
    return {
      importId,
      columns: found.columns.map((column) => ({ position: column.position, field: column.field })),
      values: [],
      defaults: { stage: "new", ownerUserId: null, budgetBasis: null },
    };
  }
  /** Matches, checks and returns an import waiting for Add. */
  async function checked(jar = owner, text = ENQUIRIES): Promise<string> {
    const importId = await uploaded(jar, text);
    await dataOf(await mutate(server, "leadImports.match", await read(importId, jar), jar));
    await checkLeadImportListener(jobs).handle(step("import.columns-matched", importId), context());
    expect((await detail(importId, jar)).status).toBe("checked");
    return importId;
  }

  it("lets only holders of both leads:create and leads:assign import", async () => {
    const file = { fileName: "enquiries.csv", contentType: CSV, sizeBytes: 10 };
    expect(await refusalOf(await mutate(server, "leadImports.start", file, salesperson))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    for (const [path, input] of [
      ["leadImports.add", { importId: randomUUID() }],
      ["leadImports.reportLink", { importId: randomUUID() }],
    ] as const) {
      expect(await refusalOf(await mutate(server, path, input, salesperson)), path).toEqual({
        status: 403,
        reason: "MISSING_PERMISSION",
      });
    }
    expect(await refusalOf(await query(server, "leadImports.recent", salesperson))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    for (const jar of [owner, admin]) {
      expect((await mutate(server, "leadImports.start", file, jar)).status).toBe(200);
    }
    expect(await dataOf(await query(server, "leadImports.recent", admin))).toHaveLength(1);
  });

  it("answers NOT_FOUND for another person's import, a staff import, or another organization's", async () => {
    const importId = await uploaded(owner);
    const staffImport = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.importBatch.create({
        data: {
          kind: "staff",
          fileName: "staff.csv",
          fileKind: "csv",
          startedBy: agency.owner.userId,
          keepUntil: new Date(Date.now() + 1e9),
        },
        select: { id: true },
      }),
    );
    const other = await createTestAgency(server);
    const stranger = await signedInOwner(server, other);
    const notFound = { status: 404, reason: "NOT_FOUND" };
    expect(await refusalOf(await query(server, "leadImports.get", admin, { importId }))).toEqual(notFound);
    expect(await refusalOf(await query(server, "leadImports.get", owner, { importId: staffImport.id }))).toEqual(
      notFound,
    );
    expect(await refusalOf(await query(server, "leadImports.get", stranger, { importId }))).toEqual(notFound);
    expect(await refusalOf(await mutate(server, "leadImports.cancel", { importId }, admin))).toEqual(notFound);
    expect(await refusalOf(await mutate(server, "leadImports.stop", { importId: staffImport.id }, owner))).toEqual(
      notFound,
    );
  });

  it("answers IMPORT_NOT_READY to a step out of turn, and IMPORT_ALREADY_RUNNING to a second import's Add", async () => {
    const importId = await uploaded(owner);
    const notReady = { status: 409, reason: "IMPORT_NOT_READY" };
    expect(await refusalOf(await mutate(server, "leadImports.add", { importId }, owner))).toEqual(notReady);
    expect(await refusalOf(await mutate(server, "leadImports.stop", { importId }, owner))).toEqual(notReady);
    expect(
      await refusalOf(
        await mutate(server, "leadImports.decide", { importId, addBlocked: true, addAlreadyImported: false }, owner),
      ),
    ).toEqual(notReady);
    const matches = await read(importId);
    expect(await refusalOf(await mutate(server, "leadImports.confirmUpload", { importId }, owner))).toEqual(notReady);
    await dataOf(await mutate(server, "leadImports.match", matches, owner));
    expect(await refusalOf(await mutate(server, "leadImports.add", { importId }, owner))).toEqual(notReady);
    await checkLeadImportListener(jobs).handle(step("import.columns-matched", importId), context());

    const first = await checked(owner, ENQUIRIES.replaceAll("98765", "98764"));
    const second = await checked(admin, ENQUIRIES.replaceAll("98765", "98763"));
    await dataOf(await mutate(server, "leadImports.add", { importId: first }, owner));
    expect(await refusalOf(await mutate(server, "leadImports.add", { importId: second }, admin))).toEqual({
      status: 409,
      reason: "IMPORT_ALREADY_RUNNING",
    });
    expect((await detail(second, admin)).status).toBe("checked");
    // The first runs to its end, then the second may.
    await addLeadImportListener(jobs).handle(step("import.add-requested", first), context());
    expect((await detail(first)).status).toBe("done");
    await dataOf(await mutate(server, "leadImports.add", { importId: second }, admin));
    await addLeadImportListener(jobs).handle(step("import.add-requested", second), context());
    expect((await detail(second, admin)).progress).toMatchObject({ rowsAdded: 3 });
  });

  it("refuses an owner target who can't work leads: NOT_A_LEAD_WORKER", async () => {
    const importId = await uploaded(owner);
    const matches = await read(importId);
    const stranger = randomUUID();
    expect(
      await refusalOf(
        await mutate(
          server,
          "leadImports.match",
          { ...matches, defaults: { ...matches.defaults, ownerUserId: stranger } },
          owner,
        ),
      ),
    ).toEqual({ status: 400, reason: "NOT_A_LEAD_WORKER" });
    expect(
      await refusalOf(
        await mutate(
          server,
          "leadImports.match",
          { ...matches, values: [{ field: "owner", value: "Asha", target: stranger }] },
          owner,
        ),
      ),
    ).toEqual({ status: 400, reason: "NOT_A_LEAD_WORKER" });
    expect(await refusalOf(await mutate(server, "leadImports.match", { ...matches, columns: [] }, owner))).toEqual({
      status: 400,
      reason: "IMPORT_NEEDS_NAME_AND_CONTACT",
    });
  });

  it("lists examples by plan, the person's recent imports, and cancels a waiting import", async () => {
    const importId = await checked(owner, "Name,Phone\nAsha,98762 00001\n,98762 00002");
    const page = await dataOf<{ items: { rowNumber: number; reasons: unknown[] }[] }>(
      await query(server, "leadImports.rows", owner, { importId, plan: "not_added" }),
    );
    expect(page.items).toMatchObject([{ rowNumber: 3, reasons: [{ code: "no_name" }] }]);
    const recent = await dataOf<{ id: string; status: string }[]>(await query(server, "leadImports.recent", owner));
    expect(recent[0]).toMatchObject({ id: importId, status: "checked" });
    await dataOf(await mutate(server, "leadImports.cancel", { importId }, owner));
    expect((await detail(importId)).status).toBe("cancelled");
    expect(await refusalOf(await mutate(server, "leadImports.cancel", { importId }, owner))).toEqual({
      status: 409,
      reason: "IMPORT_NOT_READY",
    });
  });

  it("downloads the report on a read-only agency, and refuses Add there", async () => {
    const withBadRow = "Name,Phone\nAsha,98761 00001\n,98761 00002";
    const finished = await checked(owner, withBadRow);
    await dataOf(await mutate(server, "leadImports.add", { importId: finished }, owner));
    await addLeadImportListener(jobs).handle(step("import.add-requested", finished), context());
    const waiting = await checked(owner, "Name,Phone\nRavi,98761 00003");
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "read_only", statusChangedAt: new Date() },
    });
    try {
      const link = await dataOf<{ url: string }>(
        await mutate(server, "leadImports.reportLink", { importId: finished }, owner),
      );
      expect(link.url).toContain(encodeURIComponent("rows not added"));
      expect(await refusalOf(await mutate(server, "leadImports.add", { importId: waiting }, owner))).toEqual({
        status: 403,
        reason: "ORGANIZATION_READ_ONLY",
      });
      expect(
        await refusalOf(
          await mutate(server, "leadImports.start", { fileName: "x.csv", contentType: CSV, sizeBytes: 5 }, owner),
        ),
      ).toEqual({
        status: 403,
        reason: "ORGANIZATION_READ_ONLY",
      });
    } finally {
      await server.platform.subscription.update({
        where: { organizationId: agency.organizationId },
        data: { status: "active", statusChangedAt: new Date() },
      });
    }
  });
});
