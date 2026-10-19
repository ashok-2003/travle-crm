// The value matches (spec B11, D13): the reader suggests a target for every value of a short column, for each of the
// kind's value fields; the check and the add find each value's target, the importer's choice first.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainEvent } from "../../src/jobs/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { importDetail, readImportFileListener, valueTargetsFor } from "../../src/imports/index.js";
import {
  anAgency,
  anImportWithFile,
  createTestImports,
  fakeIdentity,
  jobDependencies,
  listenerContext,
  memberOf,
  type TestImports,
} from "./support/test-imports.js";

const asha = "0199e7a0-0000-7000-8000-00000000a5a1";
const ravi = "0199e7a0-0000-7000-8000-00000000a5a2";

describe("matching a file's values", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;
  const identity = fakeIdentity({
    workers: { asha, "ravi kumar": ravi },
    roles: { sales: "sales", admin: "org-admin" },
  });
  const uploaded = (importId: string): DomainEvent => ({
    id: "0199e7a0-0000-7000-8000-00000000e0e2",
    organizationId,
    type: "import.uploaded",
    payload: { importId },
    occurredAt: new Date(),
  });

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("suggests owners, stages and roles for every value of a short column", async () => {
    const file = test.spreadsheets.bytesOf({
      header: ["Name", "Owner", "Status"],
      rows: [
        ["Lead 1", "Asha", "Booked"],
        ["Lead 2", "Someone", "Thinking"],
        ["Lead 3", "x".repeat(250), "junk"],
      ],
    });
    const { id } = await anImportWithFile(test, importer, file);
    await readImportFileListener(jobDependencies(test, identity)).handle(
      uploaded(id),
      listenerContext(test, organizationId),
    );
    const { valueMatches } = await test.db.forOrg(organizationId, (tx) => importDetail(tx, importer, "leads", id));
    const owner = valueMatches.filter((match) => match.field === "owner");
    const stage = valueMatches.filter((match) => match.field === "stage");
    // Every short column's values are suggested for both fields: a column re-matched to Owner shows them at once.
    expect(owner).toEqual(
      expect.arrayContaining([
        { field: "owner", value: "Asha", target: asha, matchedBy: "name" },
        { field: "owner", value: "Someone", target: null, matchedBy: "none" },
        { field: "owner", value: "Booked", target: null, matchedBy: "none" },
      ]),
    );
    expect(stage).toEqual(
      expect.arrayContaining([
        { field: "stage", value: "Booked", target: "won", matchedBy: "word" },
        { field: "stage", value: "junk", target: "not_a_lead", matchedBy: "word" },
        { field: "stage", value: "Thinking", target: null, matchedBy: "none" },
      ]),
    );
    // A value too long to list isn't one.
    expect(valueMatches.some((match) => match.value.length > 200)).toBe(false);
    expect(valueMatches.some((match) => match.field === "role")).toBe(false);

    const staffFile = test.spreadsheets.bytesOf({
      header: ["Name", "Designation"],
      rows: [
        ["Ravi", "Sales"],
        ["Om", "Driver"],
      ],
    });
    const { id: staffImport } = await anImportWithFile(test, importer, staffFile, { kind: "staff" });
    await readImportFileListener(jobDependencies(test, identity)).handle(
      uploaded(staffImport),
      listenerContext(test, organizationId),
    );
    const staffMatches = (
      await test.db.forOrg(organizationId, (tx) => importDetail(tx, importer, "staff", staffImport))
    ).valueMatches;
    expect(staffMatches).toEqual(
      expect.arrayContaining([
        { field: "role", value: "Sales", target: "sales", matchedBy: "name" },
        { field: "role", value: "Driver", target: null, matchedBy: "none" },
      ]),
    );
    expect(staffMatches.every((match) => match.field === "role")).toBe(true);
  });

  it("finds each value's target: the importer's choice, else the automatic match, else the default", async () => {
    const file = test.spreadsheets.bytesOf({
      header: ["Name", "Owner"],
      rows: [
        ["Lead 1", "Asha"],
        ["Lead 2", "Ravi Kumar"],
      ],
    });
    const { id } = await anImportWithFile(test, importer, file);
    await readImportFileListener(jobDependencies(test, identity)).handle(
      uploaded(id),
      listenerContext(test, organizationId),
    );
    // The importer gave Asha's rows to Ravi.
    await test.db.forOrg(organizationId, (tx) =>
      tx.importValueMatch.updateMany({
        where: { batchId: id, field: "owner", value: "Asha" },
        data: { target: ravi, matchedBy: "chosen" },
      }),
    );
    const batch = await test.db.forOrg(organizationId, (tx) => tx.importBatch.findUniqueOrThrow({ where: { id } }));
    const targets = await valueTargetsFor(listenerContext(test, organizationId), identity, batch, "owner", [
      "Asha",
      "Ravi Kumar",
      "Never listed",
      "ravi kumar",
    ]);
    expect(Object.fromEntries(targets)).toEqual({
      Asha: ravi,
      "Ravi Kumar": ravi,
      "Never listed": null,
      "ravi kumar": ravi,
    });
    const stages = await valueTargetsFor(listenerContext(test, organizationId), identity, batch, "stage", [
      "Converted",
      "?",
    ]);
    expect(Object.fromEntries(stages)).toEqual({ Converted: "won", "?": null });
  });
});
