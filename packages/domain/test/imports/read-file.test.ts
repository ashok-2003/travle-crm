// Reading an import's file in the worker (spec B1-B6, B11): its sheet, its columns with three samples and up to fifty
// values each with its count, the guesses and value suggestions, and then the matching step, or unreadable with the
// adapter's reason. A run for an import no longer reading does nothing.
import { createHash } from "node:crypto";
import { unreadableReasons as contractReasons } from "@travel-crm/contracts/imports";
import { unreadableReasons as adapterReasons, createSpreadsheets } from "@travel-crm/integrations/spreadsheets";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainEvent } from "../../src/jobs/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { findImport, importDetail, matchImportColumns, readImportFileListener } from "../../src/imports/index.js";
import { aBatch } from "./support/batches.js";
import {
  anAgency,
  anImportWithFile,
  createTestImports,
  eventsOf,
  fakeIdentity,
  jobDependencies,
  listenerContext,
  memberOf,
  type TestImports,
} from "./support/test-imports.js";

const uploaded = (organizationId: string, importId: string): DomainEvent => ({
  id: "0199e7a0-0000-7000-8000-00000000e0e1",
  organizationId,
  type: "import.uploaded",
  payload: { importId },
  occurredAt: new Date(),
});

describe("reading an import's file", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const asha = "0199e7a0-0000-7000-8000-00000000a5a1";
  const detailOf = (id: string) => test.db.forOrg(organizationId, (tx) => importDetail(tx, importer, "leads", id));
  const read = (id: string) =>
    readImportFileListener(jobDependencies(test, fakeIdentity({ workers: { asha: asha } }))).handle(
      uploaded(organizationId, id),
      listenerContext(test, organizationId),
    );

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("reads a CSV's columns: their names, three samples, and up to fifty values with their counts", async () => {
    const owners = ["Asha", "Ravi", "Asha", "", "Asha"];
    const file = test.spreadsheets.bytesOf({
      header: ["Customer Name", "Mobile No", "Assigned To", "Ref"],
      rows: owners.map((owner, index) => [`Lead ${String(index)}`, null, owner, `R${String(index)}`]),
    });
    const { id } = await anImportWithFile(test, importer, file);
    await read(id);
    const detail = await detailOf(id);
    // A CSV has no sheet to name.
    expect(detail).toMatchObject({ status: "matching", sheet: null, progress: { rowsTotal: 5 } });
    expect(detail.columns).toEqual([
      {
        position: 0,
        header: "Customer Name",
        samples: ["Lead 0", "Lead 1", "Lead 2"],
        values: [0, 1, 2, 3, 4].map((index) => ({ value: `Lead ${String(index)}`, rows: 1 })),
        field: "name",
        guessedBy: "common-name",
      },
      { position: 1, header: "Mobile No", samples: [], values: [], field: "phone", guessedBy: "common-name" },
      {
        position: 2,
        header: "Assigned To",
        samples: ["Asha", "Ravi", "Asha"],
        values: [
          { value: "Asha", rows: 3 },
          { value: "Ravi", rows: 1 },
        ],
        field: "owner",
        guessedBy: "common-name",
      },
      expect.objectContaining({ header: "Ref", field: null, guessedBy: null }),
    ]);
    const batch = await test.db.forOrg(organizationId, (tx) => findImport(tx, importer, "leads", id));
    expect(Buffer.from(batch.fileSha256 ?? []).toString("hex")).toBe(createHash("sha256").update(file).digest("hex"));
  });

  it("lists no values for a column of more than fifty, and cuts a long header", async () => {
    const file = test.spreadsheets.bytesOf({
      header: ["Name".padEnd(300, "x")],
      rows: Array.from({ length: 51 }, (_, index) => [`Lead ${String(index)}`]),
    });
    const { id } = await anImportWithFile(test, importer, file);
    await read(id);
    const [column] = (await detailOf(id)).columns;
    expect(column?.header).toHaveLength(200);
    expect(column?.values).toBeNull();
    expect(column?.samples).toEqual(["Lead 0", "Lead 1", "Lead 2"]);
  });

  it("reads a 4,000-character header through the real reader, keeps it cut to 200, and matches it (D3)", async () => {
    const header = "Remarks ".repeat(500);
    const csv = new TextEncoder().encode(`Name,Mobile,"${header}"\nAsha,98765 43210,Goa\n`);
    const { id } = await anImportWithFile(test, importer, csv);
    const real = { ...jobDependencies(test, fakeIdentity()), spreadsheets: createSpreadsheets() };
    await readImportFileListener(real).handle(uploaded(organizationId, id), listenerContext(test, organizationId));
    const detail = await detailOf(id);
    expect(detail.status).toBe("matching");
    expect(detail.columns[2]?.header).toHaveLength(200);
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        matchImportColumns(
          tx,
          importer,
          "leads",
          {
            importId: id,
            columns: (["name", "phone", "note"] as const).map((field, position) => ({ position, field })),
            values: [],
            defaults: { stage: "new", ownerUserId: null, budgetBasis: null },
          },
          { owners: new Set(), roleKeys: new Set(), now: new Date() },
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("ends an unreadable file as unreadable with its reason, and a good one as matching", async () => {
    const { id } = await anImportWithFile(
      test,
      importer,
      test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Asha"]] }),
    );
    test.spreadsheets.failNextRead("protected");
    await read(id);
    expect(await detailOf(id)).toMatchObject({ status: "unreadable", unreadableReason: "protected", columns: [] });
    const { id: good } = await anImportWithFile(
      test,
      importer,
      test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Asha"]] }),
    );
    await read(good);
    expect(await detailOf(good)).toMatchObject({ status: "matching", unreadableReason: null });
  });

  it("says the agency imported the same file before, and how many rows that added", async () => {
    const file = test.spreadsheets.bytesOf({ header: ["Name", "Phone"], rows: [["Asha", "98765 43210"]] });
    const sha = Uint8Array.from(createHash("sha256").update(file).digest());
    const finishedAt = new Date("2026-10-12T09:00:00Z");
    await test.db.forOrg(organizationId, (tx) =>
      aBatch(tx, {
        startedBy: memberOf(organizationId).userId,
        status: "done",
        fileSha256: sha,
        rowsAdded: 1094,
        finishedAt,
      }),
    );
    const { id } = await anImportWithFile(test, importer, file);
    expect((await detailOf(id)).sameFile).toBeNull();
    await read(id);
    expect((await detailOf(id)).sameFile).toEqual({ importedAt: finishedAt.toISOString(), rowsAdded: 1094 });
  });

  it("ends as failed, file withdrawn, when its file went while it waited to be read (M8)", async () => {
    const { id } = await anImportWithFile(
      test,
      importer,
      test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Asha"]] }),
    );
    // An erasure or the sweep took the file: the import no longer names it.
    await test.db.forOrg(organizationId, (tx) =>
      tx.importBatch.update({ where: { id }, data: { fileAttachmentId: null } }),
    );
    await expect(read(id)).resolves.toBeUndefined();
    expect(await detailOf(id)).toMatchObject({ status: "failed", failureReason: "file_withdrawn", columns: [] });
    expect((await detailOf(id)).finishedAt).not.toBeNull();
  });

  it("does nothing for an import no longer reading", async () => {
    const { id } = await anImportWithFile(
      test,
      importer,
      test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Asha"]] }),
      {
        status: "cancelled",
      },
    );
    await read(id);
    expect(await detailOf(id)).toMatchObject({ status: "cancelled", columns: [], progress: { rowsTotal: 0 } });
    // A second run after the first finished leaves its columns as they were.
    const { id: twice } = await anImportWithFile(
      test,
      importer,
      test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Asha"]] }),
    );
    await read(twice);
    await read(twice);
    expect((await detailOf(twice)).columns).toHaveLength(1);
  });

  it("publishes import.read once as it moves the import to matching, and not for an unreadable file", async () => {
    const file = test.spreadsheets.bytesOf({ header: ["Name"], rows: [["Asha"]] });
    const { id } = await anImportWithFile(test, importer, file);
    await read(id);
    await read(id);
    const { id: unreadable } = await anImportWithFile(test, importer, file);
    test.spreadsheets.failNextRead("no_rows");
    await read(unreadable);
    const events = await eventsOf(test, organizationId, ["import.read"]);
    expect(events.filter(([, payload]) => JSON.stringify(payload).includes(id))).toEqual([
      ["import.read", { importId: id, kind: "leads" }],
    ]);
    expect(JSON.stringify(events)).not.toContain(unreadable);
  });

  it("holds the contract's unreadable reasons equal to the adapter's", () => {
    expect([...contractReasons]).toEqual([...adapterReasons]);
  });
});
