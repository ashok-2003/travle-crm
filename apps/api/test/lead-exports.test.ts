// The lead export over HTTP (spec 6.5, B37-B42): leads:view starts, follows and downloads it, a suspended agency's Owner
// included (as exports), only its requester sees it, it isn't ready until the worker has made it and expires after 24
// hours, each download is an audit entry, and the real worker makes a file whose header row is B38's.
import { leadExportHeaders, type LeadExportDetail } from "@travel-crm/contracts/crm";
import type { DownloadLinkOutput } from "@travel-crm/contracts/files";
import { makeLeadExportListener } from "@travel-crm/domain/crm";
import { startExport } from "@travel-crm/domain/exports";
import { systemActor } from "@travel-crm/domain/kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { eventually } from "./support/eventually.js";
import { addStaff, ownerAccess, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";
import { startWorkerFlow, stopWorkerFlow, type Running, type WorkerFlow } from "./support/worker-flow.js";
import { countingWebhookProvider } from "./support/webhook-provider.js";

describe("the lead export", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let sales: CookieJar;

  const start = async (jar: CookieJar, filter: object = { view: "everyone" }) =>
    (await dataOf<{ exportId: string }>(await mutate(server, "leadExports.start", { filter, format: "xlsx" }, jar)))
      .exportId;
  const detailOf = async (exportId: string, jar = owner) =>
    dataOf<LeadExportDetail>(await query(server, "leadExports.get", jar, { exportId }));
  /** What the worker does after the request: make the file for the export.requested event. */
  async function made(exportId: string): Promise<void> {
    const event = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "export.requested", payload: { equals: { exportId, kind: "leads" } } },
      }),
    );
    await makeLeadExportListener({
      files: server.files,
      spreadsheets: server.spreadsheets,
      identity: server.identity,
      appUrl: "https://app.example.in",
    }).handle(
      {
        id: event.id,
        organizationId: agency.organizationId,
        type: event.type,
        payload: { exportId, kind: "leads" },
        occurredAt: new Date(),
      },
      { actor: systemActor(agency.organizationId), forOrg: (fn) => server.db.forOrg(agency.organizationId, fn) },
    );
  }

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    sales = await signedInStaff(server, agency, await addStaff(server, agency, { username: "zara", roleKey: "sales" }));
  });

  afterAll(async () => {
    await server.close();
  });

  it("starts, follows and downloads an export with leads:view, a suspended Owner included", async () => {
    const exportId = await start(owner, { view: "everyone", stage: "contacted", search: "Sharma" });
    expect(await detailOf(exportId)).toMatchObject({
      id: exportId,
      kind: "leads",
      status: "making",
      filter: { view: "everyone", stage: "contacted", search: "Sharma" },
      people: {},
      destinationName: null,
    });
    await made(exportId);
    // The search is emptied once the file is made; the owner and the destination are named for the page.
    const ready = await detailOf(exportId);
    expect(ready.status).toBe("ready");
    expect(ready.file?.fileName).toMatch(/^leads-.*\.xlsx$/);
    expect(ready.filter).toEqual({ view: "everyone", stage: "contacted" });
    expect((await mutate(server, "leadExports.downloadLink", { exportId }, owner)).status).toBe(200);

    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: { status: "suspended", statusChangedAt: new Date(), trialEndsOn: null },
    });
    try {
      expect((await query(server, "leadExports.get", owner, { exportId })).status).toBe(200);
      expect((await mutate(server, "leadExports.downloadLink", { exportId }, owner)).status).toBe(200);
      expect((await mutate(server, "leadExports.start", { filter: {}, format: "csv" }, owner)).status).toBe(200);
      // Not the Owner: a salesperson gets the suspension's refusal.
      expect(await refusalOf(await query(server, "leadExports.get", sales, { exportId }))).toEqual({
        status: 403,
        reason: "ORGANIZATION_SUSPENDED",
      });
    } finally {
      await server.platform.subscription.update({
        where: { organizationId: agency.organizationId },
        data: { status: "active", statusChangedAt: new Date() },
      });
    }
  });

  it("names the owner and the destination the filter holds", async () => {
    const goa = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.destination.create({ data: { name: "Goa" }, select: { id: true } }),
    );
    const exportId = await start(owner, { view: "everyone", ownerUserId: agency.owner.userId, destinationId: goa.id });
    expect(await detailOf(exportId)).toMatchObject({
      people: { [agency.owner.userId]: "Asha Owner" },
      destinationName: "Goa",
    });
  });

  it("names an owner and any destination by id, however many destinations there are", async () => {
    const places = await server.db.forOrg(agency.organizationId, async (tx) => {
      for (let number = 0; number < 120; number++)
        await tx.destination.create({ data: { name: `Aaa ${String(number)}` } });
      return tx.destination.create({ data: { name: "Zanzibar" }, select: { id: true } });
    });
    const names = await dataOf<{ people: Record<string, string>; destinationName: string | null }>(
      await query(server, "leadExports.names", sales, { ownerUserId: agency.owner.userId, destinationId: places.id }),
    );
    expect(names).toEqual({ people: { [agency.owner.userId]: "Asha Owner" }, destinationName: "Zanzibar" });
    expect(await dataOf(await query(server, "leadExports.names", owner, {}))).toEqual({
      people: {},
      destinationName: null,
    });
  });

  it("serves exactly start, get, names and downloadLink", async () => {
    const { appRouter } = await import("@travel-crm/api");
    const record = (appRouter as unknown as { _def: { record: Record<string, Record<string, unknown>> } })._def.record;
    expect(Object.keys(record.leadExports ?? {}).sort()).toEqual(["downloadLink", "get", "names", "start"]);
  });

  it("answers NOT_FOUND for another person's export or a staff export", async () => {
    const exportId = await start(owner);
    expect(await refusalOf(await query(server, "leadExports.get", sales, { exportId }))).toEqual({
      status: 404,
      reason: "NOT_FOUND",
    });
    expect(await refusalOf(await mutate(server, "leadExports.downloadLink", { exportId }, sales))).toEqual({
      status: 404,
      reason: "NOT_FOUND",
    });
    const access = await ownerAccess(server, agency);
    const staff = await server.db.forOrg(agency.organizationId, (tx) =>
      startExport(tx, access, "staff", { format: "csv", filter: {} }, new Date()),
    );
    expect(await refusalOf(await query(server, "leadExports.get", owner, { exportId: staff.exportId }))).toEqual({
      status: 404,
      reason: "NOT_FOUND",
    });
  });

  it("refuses a role without leads:view, and an input with a key it doesn't know", async () => {
    const accounts = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "kiran", roleKey: "accounts" }),
    );
    expect(
      await refusalOf(await mutate(server, "leadExports.start", { filter: {}, format: "xlsx" }, accounts)),
    ).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    expect((await mutate(server, "leadExports.start", { filter: { limit: 5 }, format: "xlsx" }, owner)).status).toBe(
      400,
    );
    expect((await mutate(server, "leadExports.start", { filter: {}, format: "pdf" }, owner)).status).toBe(400);
  });

  it("answers EXPORT_NOT_READY while it's made and EXPORT_EXPIRED after 24 hours", async () => {
    const exportId = await start(owner);
    const link = () => mutate(server, "leadExports.downloadLink", { exportId }, owner);
    expect(await refusalOf(await link())).toEqual({ status: 409, reason: "EXPORT_NOT_READY" });
    await made(exportId);
    expect((await link()).status).toBe(200);
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.dataExport.update({ where: { id: exportId }, data: { expiresAt: new Date(Date.now() - 1000) } }),
    );
    expect(await refusalOf(await link())).toEqual({ status: 409, reason: "EXPORT_EXPIRED" });
  });

  it("records export.downloaded for each download", async () => {
    const exportId = await start(owner);
    await made(exportId);
    for (let download = 0; download < 2; download++) {
      await dataOf<DownloadLinkOutput>(await mutate(server, "leadExports.downloadLink", { exportId }, owner));
    }
    const entries = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId: exportId }, orderBy: { id: "asc" } }),
    );
    expect(entries.map((entry) => entry.action)).toEqual(["export.made", "export.downloaded", "export.downloaded"]);
  });
});

describe("the lead export through the worker", () => {
  const reported: string[] = [];
  const running: Running = {};
  let flow: WorkerFlow;

  beforeAll(async () => {
    flow = await startWorkerFlow(running, reported, countingWebhookProvider("lead-export-test-secret"));
  }, 180_000);

  afterAll(async () => {
    await stopWorkerFlow(running);
    expect(reported).toEqual([]);
  });

  it("exports through the worker into a file with B38's header row", async () => {
    const { server, agency } = flow;
    const owner = await signedInOwner(server, agency);
    await server.db.forOrg(agency.organizationId, async (tx) => {
      const person = await tx.person.create({ data: { name: "Rahul Sharma", phoneE164: "+919876543210" } });
      await tx.lead.create({ data: { personId: person.id, source: "walk_in", ownerUserId: agency.owner.userId } });
    });
    const { exportId } = await dataOf<{ exportId: string }>(
      await mutate(server, "leadExports.start", { filter: { view: "everyone" }, format: "xlsx" }, owner),
    );
    const ready = await eventually(
      async () => dataOf<LeadExportDetail>(await query(server, "leadExports.get", owner, { exportId })),
      (detail) => detail.status !== "making",
      "the worker to make the export",
      30_000,
    );
    expect(ready).toMatchObject({ status: "ready", rowsTotal: 1, rowsDone: 1 });
    const link = await dataOf<DownloadLinkOutput>(
      await mutate(server, "leadExports.downloadLink", { exportId }, owner),
    );
    const bytes = new Uint8Array(await (await fetch(link.url)).arrayBuffer());
    const sheet = await server.spreadsheets.read(bytes, {
      kind: "xlsx",
      maxRows: 10,
      maxColumns: 50,
      maxCellLength: 4000,
    });
    expect(sheet.header).toEqual([...leadExportHeaders]);
    expect(sheet.rows.map((row) => [row.cells[0], row.cells[1], row.cells[19]])).toEqual([
      ["Rahul Sharma", "+91 98765 43210", "Asha Owner"],
    ]);
  }, 60_000);
});
