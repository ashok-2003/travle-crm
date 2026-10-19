// Rules the import and export tables keep themselves (spec 5): every fixed value within its list, one import of an
// agency adding at a time, a column's samples and listed values bounded, a fingerprint only on an added row and a
// password hash only before an outcome, and a purge that takes them all. Every insert runs as the runtime role inside
// forOrg; a refusal is matched by its constraint's name.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import type { OrgTx } from "../src/for-org.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  deleteOrganizationRows,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const userId = "0199e7a0-0000-7000-8000-0000000000b3";

/** Both kinds' fields (contracts' leadImportFields and staffImportFields): the column and header-match lists. */
const fields = [
  "name",
  "phone",
  "email",
  "instagram",
  "destination",
  "travel_from",
  "travel_to",
  "travel_month",
  "adults",
  "children_ages",
  "children_count",
  "budget",
  "budget_basis",
  "departure_city",
  "trip_type",
  "hotel_category",
  "food",
  "room_type",
  "stage",
  "owner",
  "enquiry_date",
  "their_source",
  "note",
  "username",
  "role",
];

describe("the import and export tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let batchId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const addBatch = (data: Partial<Prisma.ImportBatchUncheckedCreateInput>, organization = organizationId) =>
    db.forOrg(organization, (tx) =>
      tx.importBatch.create({
        data: {
          kind: "leads",
          fileName: "enquiries.csv",
          fileKind: "csv",
          startedBy: userId,
          keepUntil: new Date(),
          ...data,
        },
      }),
    );
  const addColumn = (data: Partial<Prisma.ImportColumnUncheckedCreateInput>) =>
    inOrg((tx) => tx.importColumn.create({ data: { batchId, position: 0, header: "Name", ...data } }));
  const addRow = (data: Partial<Prisma.ImportRowUncheckedCreateInput>) =>
    inOrg((tx) => tx.importRow.create({ data: { batchId, rowNumber: 2, plan: "new", ...data } }));
  const addExport = (data: Partial<Prisma.DataExportUncheckedCreateInput>) =>
    inOrg((tx) =>
      tx.dataExport.create({ data: { kind: "leads", format: "xlsx", filter: {}, requestedBy: userId, ...data } }),
    );
  let rowNumber = 100;
  const nextRow = () => (rowNumber += 1);
  // Columns sit at 0-49, one to a position in the batch; the fixture's own batch holds none.
  let position = 0;
  const nextPosition = () => (position += 1);

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Bulk tables");
    batchId = (await addBatch({})).id;
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("holds kinds, statuses, file kinds, reasons, stages, fields, plans, outcomes and formats to their lists", async () => {
    const refusals: [() => Promise<unknown>, string][] = [
      [() => addBatch({ kind: "travellers" }), "import_batch_kind_value"],
      [() => addBatch({ status: "paused" }), "import_batch_status_value"],
      [() => addBatch({ fileKind: "xls" }), "import_batch_file_kind_value"],
      [() => addBatch({ status: "unreadable", unreadableReason: "corrupt" }), "import_batch_unreadable_reason_value"],
      [() => addBatch({ status: "unreadable" }), "import_batch_unreadable_pair"],
      [() => addBatch({ unreadableReason: "no_rows" }), "import_batch_unreadable_pair"],
      [() => addBatch({ status: "failed", failureReason: "tired" }), "import_batch_failure_reason_value"],
      [() => addBatch({ defaultStage: "not_a_lead" }), "import_batch_default_stage_value"],
      [() => addBatch({ budgetBasis: "per_family" }), "import_batch_budget_basis_value"],
      [() => addBatch({ rowsDone: -1 }), "import_batch_counts"],
      [() => addBatch({ fileName: "" }), "import_batch_text_lengths"],
      [() => addColumn({ position: nextPosition(), field: "passport" }), "import_column_field_value"],
      [() => addColumn({ position: nextPosition(), header: "x".repeat(201) }), "import_column_header_length"],
      [
        () =>
          inOrg((tx) =>
            tx.importValueMatch.create({ data: { batchId, field: "destination", value: "Goa", matchedBy: "word" } }),
          ),
        "import_value_match_field_value",
      ],
      [
        () =>
          inOrg((tx) =>
            tx.importValueMatch.create({ data: { batchId, field: "stage", value: "Goa", matchedBy: "guess" } }),
          ),
        "import_value_match_matched_by_value",
      ],
      [
        () =>
          inOrg((tx) =>
            tx.importValueMatch.create({
              data: { batchId, field: "owner", value: "x".repeat(201), matchedBy: "none" },
            }),
          ),
        "import_value_match_value_length",
      ],
      [() => addRow({ rowNumber: nextRow(), plan: "maybe" }), "import_row_plan_value"],
      [() => addRow({ rowNumber: nextRow(), outcome: "skipped" }), "import_row_outcome_value"],
      [() => addRow({ rowNumber: nextRow(), exampleName: "x".repeat(121) }), "import_row_text_lengths"],
      [
        () =>
          inOrg((tx) =>
            tx.importHeaderMatch.create({ data: { kind: "leads", headerKey: "passport", field: "passport" } }),
          ),
        "import_header_match_field_value",
      ],
      [() => addExport({ kind: "invoices" }), "data_export_kind_value"],
      [() => addExport({ format: "pdf" }), "data_export_format_value"],
      [() => addExport({ status: "done" }), "data_export_status_value"],
      [() => addExport({ status: "failed", failureReason: "tired" }), "data_export_failure_reason_value"],
      [() => addExport({ rowsDone: -1 }), "data_export_counts"],
    ];
    for (const [insert, constraint] of refusals) {
      await expect(insert(), constraint).rejects.toThrow(new RegExp(`\\b${constraint}\\b`));
    }
    await expect(
      addBatch({ kind: "staff", status: "unreadable", unreadableReason: "too_large_unpacked", fileKind: "xlsx" }),
    ).resolves.toMatchObject({ unreadableReason: "too_large_unpacked" });
    await expect(
      addBatch({ status: "failed", failureReason: "over_seat_limit", defaultStage: "lost" }),
    ).resolves.toBeDefined();
    for (const field of fields)
      await expect(addColumn({ position: nextPosition(), field }), field).resolves.toBeDefined();
    await expect(
      addExport({ kind: "staff", format: "csv", status: "failed", failureReason: "too_many_rows" }),
    ).resolves.toBeDefined();
  });

  it("lets one import of an organization be adding at a time", async () => {
    const organization = await createTestOrganization(platform, "One adding");
    await addBatch({ status: "adding" }, organization);
    await expect(addBatch({ status: "adding", kind: "staff" }, organization)).rejects.toThrow(
      /import_batch_one_adding/,
    );
    await expect(addBatch({ status: "checked" }, organization)).resolves.toBeDefined();
    // Another agency adds at the same time.
    await expect(addBatch({ status: "adding" })).resolves.toBeDefined();
  });

  it("keeps three samples and fifty listed values a column, each value with its count", async () => {
    const values = Array.from({ length: 50 }, (_, index) => `Value ${String(index)}`);
    const counts = values.map((_, index) => index + 1);
    await expect(
      addColumn({ position: nextPosition(), samples: ["a", "b", "c"], distinctValues: values, distinctCounts: counts }),
    ).resolves.toBeDefined();
    await expect(addColumn({ position: nextPosition(), samples: ["a", "b", "c", "d"] })).rejects.toThrow(
      /import_column_samples/,
    );
    await expect(
      addColumn({ position: nextPosition(), distinctValues: [...values, "one more"], distinctCounts: [...counts, 1] }),
    ).rejects.toThrow(/import_column_values/);
    await expect(
      addColumn({ position: nextPosition(), distinctValues: ["a", "b"], distinctCounts: [1] }),
    ).rejects.toThrow(/import_column_values/);
    await expect(
      inOrg(
        (tx) => tx.$executeRaw`INSERT INTO import_column (id, batch_id, position, header, samples)
        VALUES (gen_random_uuid(), ${batchId}::uuid, ${nextPosition()}, 'Name', NULL)`,
      ),
    ).rejects.toThrow(/import_column_samples/);
  });

  it("keeps a fingerprint only on an added or merged row, and a password hash only before an outcome", async () => {
    const fingerprint = new Uint8Array(32).fill(7);
    await expect(addRow({ rowNumber: nextRow(), outcome: "added", fingerprint })).resolves.toBeDefined();
    await expect(addRow({ rowNumber: nextRow(), outcome: "merged", fingerprint })).resolves.toBeDefined();
    await expect(addRow({ rowNumber: nextRow(), fingerprint })).rejects.toThrow(/import_row_fingerprint_added/);
    await expect(addRow({ rowNumber: nextRow(), outcome: "left_out", fingerprint })).rejects.toThrow(
      /import_row_fingerprint_added/,
    );
    await expect(addRow({ rowNumber: nextRow(), passwordHash: "hash" })).resolves.toBeDefined();
    await expect(addRow({ rowNumber: nextRow(), outcome: "added", passwordHash: "hash" })).rejects.toThrow(
      /import_row_password_before_outcome/,
    );
  });

  it("purges an organization with imports, their rows, a report and an export", async () => {
    const purged = await createTestOrganization(platform, "Purged imports");
    await db.forOrg(purged, async (tx) => {
      const file = (recordType: string) =>
        tx.attachment.create({
          data: { recordType, recordId: userId, fileName: "f.csv", contentType: "text/csv", sizeBytes: 1 },
        });
      const batch = await tx.importBatch.create({
        data: {
          kind: "leads",
          fileName: "enquiries.csv",
          fileKind: "csv",
          startedBy: userId,
          keepUntil: new Date(),
          fileAttachmentId: (await file("import_batch")).id,
          reportAttachmentId: (await file("import_report")).id,
        },
      });
      await tx.importColumn.create({ data: { batchId: batch.id, position: 0, header: "Name" } });
      await tx.importValueMatch.create({
        data: { batchId: batch.id, field: "stage", value: "Booked", matchedBy: "word" },
      });
      await tx.importRow.create({ data: { batchId: batch.id, rowNumber: 2, plan: "new" } });
      await tx.importHeaderMatch.create({ data: { kind: "leads", headerKey: "name", field: "name" } });
      await tx.dataExport.create({
        data: {
          kind: "leads",
          format: "csv",
          filter: {},
          requestedBy: userId,
          fileAttachmentId: (await file("data_export")).id,
        },
      });
    });
    await expect(platformDb.transaction((tx) => deleteOrganizationRows(tx, purged))).resolves.toMatchObject({
      import_batch: 1,
      import_column: 1,
      import_value_match: 1,
      import_row: 1,
      import_header_match: 1,
      data_export: 1,
      attachment: 3,
      organization: 1,
    });
  });
});
