// The staff import's procedures through the HTTP app (spec 6.5), and the whole flow through the worker: every procedure
// on a fresh session with staff:manage in the core plan module; the seats checked at Add; passwords 25 a call; and five
// people imported with roles, each of whom signs in with the organization code and must choose a password.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { matchAsGuessed, sendPasswords, uploadStaffFile, viewOf, waitForStatus } from "./support/staff-import-flow.js";
import { signInWithCode, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";
import { startWorkerFlow, stopWorkerFlow, type Running, type WorkerFlow } from "./support/worker-flow.js";
import { countingWebhookProvider } from "./support/webhook-provider.js";

describe("the staff import's procedures", () => {
  const reported: string[] = [];
  const running: Running = {};
  let flow: WorkerFlow;
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;

  beforeAll(async () => {
    flow = await startWorkerFlow(running, reported, countingWebhookProvider("staff-imports-secret"));
    ({ server, agency } = flow);
    owner = await signedInOwner(server, agency);
  }, 180_000);

  afterAll(async () => {
    await stopWorkerFlow(running);
    expect(reported).toEqual([]);
  });

  const someId = "0199e7a0-0000-7000-8000-0000000000aa";

  it("puts every staff import procedure on a fresh session with staff:manage, on core", async () => {
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "seller", roleKey: "sales" }),
    );
    const calls: [string, unknown, "query" | "mutation"][] = [
      ["staffImports.start", { fileName: "t.csv", contentType: "text/csv", sizeBytes: 10 }, "mutation"],
      ["staffImports.confirmUpload", { importId: someId }, "mutation"],
      ["staffImports.match", { importId: someId, columns: [], values: [], defaults: { roleKey: null } }, "mutation"],
      [
        "staffImports.setPasswords",
        { importId: someId, passwords: [{ rowNumber: 2, password: "x".repeat(12) }] },
        "mutation",
      ],
      ["staffImports.add", { importId: someId }, "mutation"],
      ["staffImports.cancel", { importId: someId }, "mutation"],
      ["staffImports.get", { importId: someId }, "query"],
      ["staffImports.rows", { importId: someId, plan: "not_added" }, "query"],
      ["staffImports.recent", undefined, "query"],
    ];
    for (const [path, input, kind] of calls) {
      const denied =
        kind === "query" ? await query(server, path, sales, input) : await mutate(server, path, input, sales);
      expect(await refusalOf(denied), path).toEqual({ status: 403, reason: "MISSING_PERMISSION" });
      const anonymous =
        kind === "query" ? await query(server, path, undefined, input) : await mutate(server, path, input);
      expect(anonymous.status, path).toBe(401);
    }
    // Someone else's import (or none) is not found, and its Recent imports are the person's own.
    expect(await refusalOf(await query(server, "staffImports.get", owner, { importId: someId }))).toEqual({
      status: 404,
      reason: "NOT_FOUND",
    });
  });

  it("refuses Add over the seat limit: IMPORT_OVER_SEAT_LIMIT", async () => {
    const importId = await uploadStaffFile(server, owner, "Name,Username,Role\nSeat Taker,seat.taker,Sales\n");
    const checked = await matchAsGuessed(server, owner, importId);
    expect(checked.counts?.byPlan.new).toBe(1);
    await sendPasswords(server, owner, importId, [2], () => "Seat-pass-12345");
    // The plan's seats are far away, so the file is made to add more people than the agency has seats free.
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.importBatch.update({ where: { id: importId }, data: { rowsToAdd: 5000 } }),
    );
    expect(await refusalOf(await mutate(server, "staffImports.add", { importId }, owner))).toMatchObject({
      reason: "IMPORT_OVER_SEAT_LIMIT",
    });
    expect((await viewOf(server, owner, importId)).status).toBe("checked");
    await dataOf(await mutate(server, "staffImports.cancel", { importId }, owner));
  });

  it("refuses setPasswords for more than 25 at once", async () => {
    const passwords = Array.from({ length: 26 }, (_, index) => ({ rowNumber: index + 2, password: "x".repeat(12) }));
    expect((await mutate(server, "staffImports.setPasswords", { importId: someId, passwords }, owner)).status).toBe(
      400,
    );
    expect((await mutate(server, "staffImports.setPasswords", { importId: someId, passwords: [] }, owner)).status).toBe(
      400,
    );
  });

  it("imports five staff with roles through the worker; each signs in with the organization code and must choose a password", async () => {
    const people = ["Asha", "Bela", "Chirag", "Dev", "Esha"].map((name, index) => ({
      name,
      username: `${name.toLowerCase()}.team`,
      role: index % 2 === 0 ? "Sales" : "Operations",
      password: `Imported-${name}-pass-1`,
    }));
    const csv = [
      "Name,Username,Phone,Role",
      ...people.map((p, i) => `${p.name},${p.username},98765 0123${String(i)},${p.role}`),
    ].join("\n");
    const importId = await uploadStaffFile(server, owner, csv);
    const preview = await matchAsGuessed(server, owner, importId);
    expect(preview.counts?.byPlan.new).toBe(5);
    const passwordOf = (rowNumber: number) => people[rowNumber - 2]?.password ?? "";
    await sendPasswords(server, owner, importId, [2, 3, 4, 5, 6], passwordOf);
    await dataOf(await mutate(server, "staffImports.add", { importId }, owner));
    const done = await waitForStatus(server, owner, importId, "done");
    expect(done.added.map((person) => person.name)).toEqual(people.map((person) => person.name));
    for (const [index, person] of people.entries()) {
      const jar = await signedIn(person.username, person.password);
      const me = await dataOf<{ pendingStep: string | null }>(await query(server, "me.get", jar));
      expect(me.pendingStep).toBe("CHANGE_PASSWORD");
      const added = done.added[index];
      expect(added?.username).toBe(person.username);
    }
    const roles = await dataOf<{ name: string; role: { key: string }; phone: string | null }[]>(
      await query(server, "staff.list", owner),
    );
    expect(roles.find((member) => member.name === "Bela")).toMatchObject({
      role: { key: "operations" },
      phone: "+919876501231",
    });
    expect(roles.find((member) => member.name === "Asha")?.role.key).toBe("sales");
  }, 120_000);

  async function signedIn(username: string, password: string): Promise<CookieJar> {
    const { CookieJar } = await import("./support/cookie-jar.js");
    const jar = new CookieJar();
    const response = await signInWithCode(server, jar, { orgCode: agency.code, username, password });
    expect(response.status).toBe(200);
    return jar;
  }
});
