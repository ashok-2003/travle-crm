// The lead import's check (bulk plan, Task 1.3; Review Focus 3): a dry run of every row. Each row is planned from one
// set of lookups for the file; rows earlier in the file count; and nothing is changed.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkLeadImportListener } from "../../../src/crm/index.js";
import { lookUpLeadRows } from "../../../src/crm/lead-import/lead-lookups.js";
import { readLeadFile } from "../../../src/crm/lead-import/lead-read.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import { findImport, importBatchOf, importCounts, importRowsPage, rowFingerprint } from "../../../src/imports/index.js";
import { aRow } from "../../imports/support/batches.js";
import {
  anAgency,
  createTestImports,
  fakeIdentity,
  jobDependencies,
  listenerContext,
  memberOf,
  type TestImports,
} from "../../imports/support/test-imports.js";
import { aLead, aPerson, freshPhone } from "../support/records.js";
import { aLeadImport, stepEvent, type LeadFileSeed } from "./support/lead-imports.js";

const HEADER = ["Name", "Phone", "Email", "Destination", "Stage", "Owner"];
const FIELDS: LeadFileSeed["fields"] = ["name", "phone", "email", "destination", "stage", "owner"];

describe("checking a lead import", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const asha = randomUUID();
  const ravi = randomUUID();
  const owner = randomUUID();
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);
  const identity = () => fakeIdentity({ access: importer, workers: { asha, ravi }, firstOwner: owner });

  const check = async (file: LeadFileSeed) => {
    const { id } = await aLeadImport(test, importer, file);
    await checkLeadImportListener(jobDependencies(test, identity())).handle(
      stepEvent(organizationId, "import.columns-matched", id),
      listenerContext(test, organizationId),
    );
    return id;
  };
  const planOf = async (id: string) =>
    inOrg(async (tx) =>
      (await tx.importRow.findMany({ where: { batchId: id }, orderBy: { rowNumber: "asc" } })).map((row) => [
        row.rowNumber,
        row.plan,
        row.reasons[0] ?? null,
      ]),
    );
  const row = (name: string | null, phone: string | null, extra: (string | null)[] = []) => [name, phone, ...extra];

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("plans each row: new, returning, a repeat enquiry on an open lead, blocked, already imported, or not added with its reason", async () => {
    const [openPhone, closedPhone, blockedPhone, newPhone, importedPhone] = [
      freshPhone(),
      freshPhone(),
      freshPhone(),
      freshPhone(),
      freshPhone(),
    ] as [string, string, string, string, string];
    await inOrg(async (tx) => {
      const open = await aPerson(tx, { phoneE164: openPhone });
      await aLead(tx, { personId: open.id });
      const closed = await aPerson(tx, { phoneE164: closedPhone });
      await aLead(tx, { personId: closed.id, stage: "won" });
      await tx.blockedContact.create({ data: { kind: "phone", value: blockedPhone } });
    });
    const file: LeadFileSeed = {
      header: HEADER,
      fields: FIELDS,
      rows: [
        row("Asha Rao", newPhone),
        row("Closed Customer", closedPhone),
        row("Open Customer", openPhone),
        row("Blocked Person", blockedPhone),
        row("Imported Before", importedPhone),
        row(null, freshPhone()),
        row("No Contact", null),
      ],
    };
    // The fifth row was added by an earlier import: its fingerprint is on that import's row.
    const probe = await aLeadImport(test, importer, { ...file, seed: { status: "matching" } });
    const batch = await inOrg((tx) => importBatchOf(tx, probe.id));
    if (batch === null) throw new Error("no batch");
    const { rows } = await readLeadFile(
      listenerContext(test, organizationId),
      jobDependencies(test, identity()),
      batch,
    );
    const imported = rows[4];
    if (imported?.kind !== "enquiry") throw new Error("not read");
    await inOrg(async (tx) => {
      const earlier = await tx.importBatch.create({
        data: {
          kind: "leads",
          status: "done",
          fileName: "earlier.csv",
          fileKind: "csv",
          startedBy: importer.userId,
          keepUntil: new Date(Date.now() + 1e9),
        },
        select: { id: true },
      });
      await aRow(tx, {
        batchId: earlier.id,
        rowNumber: 2,
        outcome: "added",
        fingerprint: Uint8Array.from(rowFingerprint("leads", imported.fingerprintValues)),
      });
    });

    const id = await check(file);
    const planned = (await planOf(id)).map(([number, plan]) => [number, plan]);
    expect(planned).toEqual([
      [2, "new"],
      [3, "returning"],
      [4, "enquiry"],
      [5, "blocked"],
      [6, "already_imported"],
      [7, "not_added"],
      [8, "not_added"],
    ]);
    const reasons = (await planOf(id)).map(([, , reason]) => reason);
    expect(reasons.slice(3)).toEqual([
      "blocked",
      expect.stringMatching(/^already_imported:\d{4}-\d{2}-\d{2}$/),
      "no_name",
      "no_contact",
    ]);
    const batchAfter = await inOrg((tx) => findImport(tx, importer, "leads", id));
    expect(batchAfter).toMatchObject({ status: "checked", rowsTotal: 7, rowsToAdd: 3, rowsNewStage: 2 });
  });

  it("makes a later row for the same person a repeat enquiry on the lead an earlier row makes", async () => {
    const phone = freshPhone();
    const email = `later-${randomUUID().slice(0, 8)}@example.com`;
    const id = await check({
      header: HEADER,
      fields: FIELDS,
      rows: [
        row("Meera Joshi", phone, [null, "Kerala"]),
        row("Meera Joshi", phone, [email, "Goa"]),
        // Only the email just filled in: still Meera.
        row("Meera J", null, [email, "Spiti"]),
        // Imported Won: closed, so the next row for the same person is a returning lead.
        row("Won Person", freshPhone(), [null, "Goa", "Booked"]),
      ],
    });
    expect((await planOf(id)).map(([number, plan]) => [number, plan])).toEqual([
      [2, "new"],
      [3, "enquiry"],
      [4, "enquiry"],
      [5, "new"],
    ]);
  });

  it("plans a person imported Won and met again as returning", async () => {
    const phone = freshPhone();
    const id = await check({
      header: HEADER,
      fields: FIELDS,
      rows: [row("Won Person", phone, [null, "Goa", "Booked"]), row("Won Person", phone, [null, "Spiti"])],
    });
    expect((await planOf(id)).map(([number, plan]) => [number, plan])).toEqual([
      [2, "new"],
      [3, "returning"],
    ]);
  });

  it("leaves a row identical to an earlier one out as 'Same as row 12'", async () => {
    const phone = freshPhone();
    const id = await check({
      header: HEADER,
      fields: FIELDS,
      rows: [row("Same Person", phone, [null, "Goa"]), row("Same Person", phone, [null, "Goa"])],
    });
    expect(await planOf(id)).toEqual([
      [2, "new", null],
      [3, "not_added", "same_as_row:2"],
    ]);
  });

  it("names the destinations the import will add, once each, ignoring case", async () => {
    await inOrg((tx) => tx.destination.create({ data: { name: "Goa" } }));
    const id = await check({
      header: HEADER,
      fields: FIELDS,
      rows: [
        row("A", freshPhone(), [null, "goa"]),
        row("B", freshPhone(), [null, "Spiti"]),
        row("C", freshPhone(), [null, "SPITI"]),
        row("D", freshPhone(), [null, "Andaman"]),
      ],
    });
    const counts = await inOrg(async (tx) => importCounts(tx, { id, rowsNewStage: 0 }));
    expect(counts.newDestinations.map((name) => name.toLowerCase())).toEqual(["andaman", "spiti"]);
  });

  it("counts the leads that will be New", async () => {
    const id = await check({
      header: HEADER,
      fields: FIELDS,
      rows: [
        row("A", freshPhone()),
        row("B", freshPhone(), [null, null, "Booked"]),
        row("C", freshPhone(), [null, null, "Called"]),
        row("D", freshPhone()),
      ],
    });
    const batch = await inOrg((tx) => findImport(tx, importer, "leads", id));
    expect([batch.rowsToAdd, batch.rowsNewStage]).toEqual([4, 2]);
  });

  it("looks up contacts, open leads, blocked contacts and destinations once per kind for the whole file", async () => {
    const queries = async (rowCount: number) => {
      const id = await aLeadImport(test, importer, {
        header: HEADER,
        fields: FIELDS,
        rows: Array.from({ length: rowCount }, (_, index) =>
          row(`Person ${String(index)}`, freshPhone(), [
            `p${String(index)}-${randomUUID().slice(0, 6)}@example.com`,
            `Place ${String(index)}`,
          ]),
        ),
        seed: { status: "matching" },
      });
      const batch = await inOrg((tx) => importBatchOf(tx, id.id));
      if (batch === null) throw new Error("no batch");
      const { rows } = await readLeadFile(
        listenerContext(test, organizationId),
        jobDependencies(test, identity()),
        batch,
      );
      let statements = 0;
      await inOrg(async (tx) => {
        const counting = new Proxy(tx, {
          get: (target, property, receiver) => {
            const value: unknown = Reflect.get(target, property, receiver);
            if (property !== "$queryRaw" || typeof value !== "function") return value;
            return (...args: unknown[]) => {
              statements += 1;
              return (value as (...inner: unknown[]) => unknown).apply(target, args);
            };
          },
        });
        await lookUpLeadRows(counting, rows);
      });
      return statements;
    };
    const small = await queries(5);
    const large = await queries(60);
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(8);
  });

  it("matches an Owner column of more than fifty values at the check, value by value", async () => {
    const workers = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [`agent ${String(index)}`, randomUUID()]),
    );
    const id = await aLeadImport(test, importer, {
      header: HEADER,
      fields: FIELDS,
      rows: Object.keys(workers).map((name, index) =>
        row(`Customer ${String(index)}`, freshPhone(), [null, null, null, name]),
      ),
      seed: { status: "matching" },
    });
    const batch = await inOrg((tx) => importBatchOf(tx, id.id));
    if (batch === null) throw new Error("no batch");
    const file = await readLeadFile(
      listenerContext(test, organizationId),
      jobDependencies(test, fakeIdentity({ access: importer, workers, firstOwner: owner })),
      batch,
    );
    const owners = file.rows.map((reading) => (reading.kind === "enquiry" ? reading.ownerUserId : null));
    expect(owners).toEqual(Object.values(workers));
  });

  it("changes no lead, person or destination, and a second run writes the same rows", async () => {
    const file: LeadFileSeed = {
      header: HEADER,
      fields: FIELDS,
      rows: [row("Dry Run", freshPhone(), [null, "Brand New Place"]), row("Dry Run Two", freshPhone())],
    };
    const counts = () =>
      inOrg(async (tx) => [
        await tx.lead.count(),
        await tx.person.count(),
        await tx.destination.count(),
        await tx.leadTimelineEntry.count(),
      ]);
    const before = await counts();
    const id = await check(file);
    const first = await planOf(id);
    expect(await counts()).toEqual(before);
    await inOrg((tx) => tx.importBatch.update({ where: { id }, data: { status: "checking" } }));
    await checkLeadImportListener(jobDependencies(test, identity())).handle(
      stepEvent(organizationId, "import.columns-matched", id),
      listenerContext(test, organizationId),
    );
    expect(await planOf(id)).toEqual(first);
    expect(await counts()).toEqual(before);
    const page = await inOrg((tx) => importRowsPage(tx, importer, "leads", { importId: id, plan: "new", limit: 5 }));
    expect(page.items.map((item) => item.name)).toEqual(["Dry Run", "Dry Run Two"]);
  });

  it("leaves an import that has moved on, or another kind's, alone", async () => {
    const { id } = await aLeadImport(test, importer, {
      header: HEADER,
      fields: FIELDS,
      rows: [row("A", freshPhone())],
      seed: { status: "checked" },
    });
    await checkLeadImportListener(jobDependencies(test, identity())).handle(
      stepEvent(organizationId, "import.columns-matched", id),
      listenerContext(test, organizationId),
    );
    expect(await planOf(id)).toEqual([]);
  });
});
