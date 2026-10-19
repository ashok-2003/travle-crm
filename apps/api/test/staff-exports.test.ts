// The staff export through the HTTP app and the worker (spec 6.5, B52): started, followed and downloaded on a fresh
// session with staff:manage, made as a real .xlsx file; another person's export is not found, and a person without
// staff:manage is refused.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExportDetail } from "@travel-crm/contracts/exports";
import type { CookieJar } from "./support/cookie-jar.js";
import { eventually } from "./support/eventually.js";
import { addStaff, ownerAccess, signedInOwner, signedInStaff } from "./support/people.js";
import type { TestAgency, TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";
import { countingWebhookProvider } from "./support/webhook-provider.js";
import { startWorkerFlow, stopWorkerFlow, type Running, type WorkerFlow } from "./support/worker-flow.js";

describe("the staff export's procedures", () => {
  const reported: string[] = [];
  const running: Running = {};
  let flow: WorkerFlow;
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;

  beforeAll(async () => {
    flow = await startWorkerFlow(running, reported, countingWebhookProvider("staff-exports-secret"));
    ({ server, agency } = flow);
    owner = await signedInOwner(server, agency);
  }, 180_000);

  afterAll(async () => {
    await stopWorkerFlow(running);
    expect(reported).toEqual([]);
  });

  it("starts, follows and downloads a staff export on a fresh session with staff:manage; another's is NOT_FOUND", async () => {
    const started = await dataOf<{ exportId: string }>(
      await mutate(server, "staffExports.start", { format: "xlsx" }, owner),
    );
    const ready = await eventually(
      () =>
        query(server, "staffExports.get", owner, { exportId: started.exportId }).then((r) => dataOf<ExportDetail>(r)),
      (detail) => detail.status === "ready",
      "the staff export",
      30_000,
    );
    expect(ready).toMatchObject({ kind: "staff", format: "xlsx", rowsTotal: 1, rowsDone: 1 });
    expect(ready.file?.fileName).toMatch(/^staff-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const link = await dataOf<{ url: string }>(
      await mutate(server, "staffExports.downloadLink", { exportId: started.exportId }, owner),
    );
    const download = await fetch(link.url);
    expect(download.status).toBe(200);
    // An .xlsx is a zip.
    expect(new Uint8Array(await download.arrayBuffer()).slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));

    const admin = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "other.admin", roleKey: "org-admin" }),
    );
    for (const response of [
      await query(server, "staffExports.get", admin, { exportId: started.exportId }),
      await mutate(server, "staffExports.downloadLink", { exportId: started.exportId }, admin),
    ]) {
      expect(await refusalOf(response)).toEqual({ status: 404, reason: "NOT_FOUND" });
    }
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "just.sales", roleKey: "sales" }),
    );
    for (const response of [
      await mutate(server, "staffExports.start", { format: "csv" }, sales),
      await query(server, "staffExports.get", sales, { exportId: started.exportId }),
      await mutate(server, "staffExports.downloadLink", { exportId: started.exportId }, sales),
    ]) {
      expect(await refusalOf(response)).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
    }
    expect((await mutate(server, "staffExports.start", { format: "pdf" }, owner)).status).toBe(400);
  }, 120_000);

  it("writes a name that starts with = as text in the file, never as a formula", async () => {
    await server.identity.staff.create(await ownerAccess(server, agency), {
      name: "=HYPERLINK(1)",
      username: "cheeky.name",
      roleKey: "sales",
      temporaryPassword: "cheeky-pass-123",
    });
    const started = await dataOf<{ exportId: string }>(
      await mutate(server, "staffExports.start", { format: "csv" }, owner),
    );
    await eventually(
      () =>
        query(server, "staffExports.get", owner, { exportId: started.exportId }).then((r) => dataOf<ExportDetail>(r)),
      (detail) => detail.status === "ready",
      "the staff export",
      30_000,
    );
    const link = await dataOf<{ url: string }>(
      await mutate(server, "staffExports.downloadLink", { exportId: started.exportId }, owner),
    );
    const text = await (await fetch(link.url)).text();
    expect(text).toContain(`"'=HYPERLINK(1)"`);
    expect(text).not.toContain(`"=HYPERLINK(1)"`);
  }, 120_000);
});
