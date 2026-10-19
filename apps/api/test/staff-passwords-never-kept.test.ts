// The staff import's temporary passwords are made in the browser and live only in the setPasswords requests (B46): after
// a whole import through the api and the worker, no plain password is in a job's data, any column of any table, the
// events, the audit log or anything the processes wrote to their logs. The hashes are, and sign-in works with them.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { matchAsGuessed, sendPasswords, uploadStaffFile, waitForStatus } from "./support/staff-import-flow.js";
import { signInWithCode, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate } from "./support/trpc.js";
import { countingWebhookProvider } from "./support/webhook-provider.js";
import { startWorkerFlow, stopWorkerFlow, type Running, type WorkerFlow } from "./support/worker-flow.js";

describe("the staff import never keeps a password", () => {
  const reported: string[] = [];
  const written: string[] = [];
  const running: Running = {};
  let flow: WorkerFlow;
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;

  beforeAll(async () => {
    // Everything either process writes to its output, for the search at the end.
    for (const stream of [process.stdout, process.stderr]) {
      vi.spyOn(stream, "write").mockImplementation((chunk: unknown) => {
        written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
        return true;
      });
    }
    flow = await startWorkerFlow(running, reported, countingWebhookProvider("staff-passwords-secret"));
    ({ server, agency } = flow);
    owner = await signedInOwner(server, agency);
  }, 180_000);

  afterAll(async () => {
    await stopWorkerFlow(running);
    vi.restoreAllMocks();
    expect(reported).toEqual([]);
  });

  const passwords = [2, 3, 4].map((rowNumber) => `Plain-Secret-${String(rowNumber)}-Zq7Kx`);

  it("never keeps a password in a job's data, the database or a log", async () => {
    const csv = [
      "Name,Username,Role",
      "One,one.secret,Sales",
      "Two,two.secret,Sales",
      "Three,three.secret,Operations",
    ].join("\n");
    const importId = await uploadStaffFile(server, owner, csv);
    await matchAsGuessed(server, owner, importId);
    await sendPasswords(server, owner, importId, [2, 3, 4], (rowNumber) => passwords[rowNumber - 2] ?? "");
    await dataOf(await mutate(server, "staffImports.add", { importId }, owner));
    await waitForStatus(server, owner, importId, "done");

    // Sign-in with each password works: the hashes are there.
    for (const [index, username] of ["one.secret", "two.secret", "three.secret"].entries()) {
      const response = await signInWithCode(server, new (await import("./support/cookie-jar.js")).CookieJar(), {
        orgCode: agency.code,
        username,
        password: passwords[index] ?? "",
      });
      expect(response.status).toBe(200);
    }

    // No table, in the organizations' schema or pg-boss's, holds a row that mentions one of them.
    const tablesMentioning = (text: string) =>
      server.platform.$queryRaw<{ table: string; hits: number }[]>`
        SELECT format('%I.%I', table_schema, table_name) AS "table",
          (xpath('/row/c/text()', query_to_xml(
            format('SELECT count(*) AS c FROM %I.%I t WHERE t::text LIKE %L', table_schema, table_name, '%' || ${text} || '%'),
            false, true, '')))[1]::text::int AS hits
        FROM information_schema.tables
        WHERE table_schema IN ('public', 'pgboss') AND table_type = 'BASE TABLE'`;
    // The search finds what is there: the imported people's usernames are on their accounts.
    expect((await tablesMentioning("one.secret")).some((entry) => entry.hits > 0)).toBe(true);
    for (const password of passwords) {
      expect((await tablesMentioning(password)).filter((entry) => entry.hits > 0)).toEqual([]);
    }
    // A request the api refuses for its password, and one it refuses for its step, leave no password in the logs either.
    const refused = await mutate(
      server,
      "staffImports.setPasswords",
      { importId, passwords: [{ rowNumber: 2, password: "Tiny-SECR" }] },
      owner,
    );
    expect(refused.status).toBe(400);
    const late = await mutate(
      server,
      "staffImports.setPasswords",
      { importId, passwords: [{ rowNumber: 2, password: "Late-Plain-Secret-9" }] },
      owner,
    );
    expect(late.status).toBe(409);
    // And nothing either process wrote.
    const output = [...written, ...reported].join("\n");
    for (const secret of ["Tiny-SECR", "Late-Plain-Secret-9"]) expect(output).not.toContain(secret);
    for (const password of passwords) expect(output).not.toContain(password);
  }, 120_000);
});
