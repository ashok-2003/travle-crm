// The lead export's pages while leads change (B41): by keyset and bounded by the newest lead the count saw, so a lead
// added, removed or moved between two pages never makes a page repeat a lead or skip one nobody touched, and the file
// holds no more than the leads counted.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { leadExportSource } from "../../src/crm/lead-export/lead-export-source.js";
import type { ExportJobDependencies } from "../../src/exports/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { fakeExportIdentity } from "../exports/test-exports.js";
import {
  anAgency,
  createTestImports,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";
import { aLead, aPerson } from "./support/records.js";

describe("the lead export's pages", () => {
  let test: TestImports;
  let organizationId: string;
  let manager: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);
  const filter = { view: "everyone", stage: "open" } as const;

  const source = () => {
    const dependencies: ExportJobDependencies = {
      files: test.files,
      spreadsheets: test.spreadsheets,
      identity: fakeExportIdentity(manager),
      appUrl: "https://app.example.test",
    };
    return leadExportSource(dependencies, { timeZone: "Asia/Kolkata", pageSize: 2 });
  };
  const newLead = (name: string) =>
    inOrg(async (tx) => (await aLead(tx, { personId: (await aPerson(tx, { name })).id })).id);
  /** The lead id a row's last cell links to. */
  const idOf = (row: (string | number | null)[]) => String(row.at(-1)).split("/").at(-1) ?? "";

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    manager = memberOf(organizationId, "org-admin");
  });

  afterAll(async () => {
    await test.close();
  });

  it("repeats no lead and skips none nobody touched, whatever changes between two pages", async () => {
    const leads: string[] = [];
    for (let number = 1; number <= 7; number++) leads.push(await newLead(`Lead ${String(number)}`));
    const [l1, l2, l3, l4, l5, l6, l7] = leads;
    const context = listenerContext(test, organizationId);
    const run = source();
    expect(await run.count(context, manager, filter)).toBe(7);

    const first = await run.page(context, manager, filter, null);
    expect(first.rows.map(idOf)).toEqual([l7, l6]);
    // Between the pages: one added, one removed and one moved on that the export hasn't reached, one it has moved.
    await newLead("Added meanwhile");
    await inOrg(async (tx) => {
      await tx.lead.update({ where: { id: l4 ?? "" }, data: { deletedAt: new Date() } });
      await tx.lead.update({ where: { id: l3 ?? "" }, data: { stage: "won" } });
      await tx.lead.update({ where: { id: l7 ?? "" }, data: { stage: "quote_sent" } });
    });

    const seen = first.rows.map(idOf);
    for (let after = first.next; after !== null;) {
      const page = await run.page(context, manager, filter, after);
      seen.push(...page.rows.map(idOf));
      after = page.next;
    }
    expect(new Set(seen).size).toBe(seen.length);
    for (const untouched of [l7, l6, l5, l2, l1]) expect(seen).toContain(untouched);
    expect(seen).not.toContain(l4);
    expect(seen.length).toBeLessThanOrEqual(7);
  });

  it("holds exactly the leads counted: one added after the count stays out", async () => {
    const context = listenerContext(test, organizationId);
    const run = source();
    const counted = await run.count(context, manager, filter);
    const added = await newLead("Added after the count");
    const seen: string[] = [];
    for (let after: string | null = null, first = true; first || after !== null; first = false) {
      const page = await run.page(context, manager, filter, after);
      seen.push(...page.rows.map(idOf));
      after = page.next;
    }
    expect(seen).toHaveLength(counted);
    expect(seen).not.toContain(added);
  });
});
