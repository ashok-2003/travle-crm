// Rules the Sheets sync's tables keep themselves (spec 5): every fixed value within its list, one live connection per
// spreadsheet and tab in an agency, a ledger row unique by hash and occurrence, a fingerprint only where it belongs, short
// examples, the runtime role's grants, and a purge that takes everything including the schedule and the claim. Every
// insert runs as the runtime role inside forOrg; a refusal is matched by its constraint's name.
import { randomUUID } from "node:crypto";
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
import { sheetSchedule, spreadsheetClaims } from "../src/sheet-schedule.js";
import { createTestOrganization } from "./helpers.js";

const userId = "0199e7a0-0000-7000-8000-0000000000b4";

/** The lead import's fields without stage (contracts' sheetFields): the column list. */
const sheetFields = [
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
  "owner",
  "enquiry_date",
  "their_source",
  "note",
];

const newSpreadsheetId = () => `${randomUUID().replaceAll("-", "")}sheet`;
const hash = (byte: number) => Buffer.alloc(32, byte);

describe("the Google Sheets tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let connectionId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const addConnection = (
    data: Partial<Prisma.SheetConnectionUncheckedCreateInput> = {},
    organization = organizationId,
  ) =>
    db.forOrg(organization, (tx) =>
      tx.sheetConnection.create({
        data: {
          spreadsheetId: newSpreadsheetId(),
          tabGid: "0",
          tabTitle: "Form responses 1",
          sheetTitle: "Goa Diwali campaign",
          sheetLocale: "en_IN",
          sheetTimeZone: "Asia/Kolkata",
          serviceAccountIndex: 0,
          connectedBy: userId,
          ...data,
        },
      }),
    );
  const addColumn = (data: Partial<Prisma.SheetColumnUncheckedCreateInput>) =>
    inOrg((tx) => tx.sheetColumn.create({ data: { connectionId, headerKey: randomUUID(), header: "Name", ...data } }));
  const addRow = (data: Partial<Prisma.SheetRowUncheckedCreateInput>) =>
    inOrg((tx) =>
      tx.sheetRow.create({
        data: { connectionId, rawHash: hash(Math.floor(Math.random() * 255)), rowNumber: 2, status: "added", ...data },
      }),
    );
  let hashByte = 0;
  const nextHash = () => hash((hashByte += 1) % 256 || 1);

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Sheets tables");
    connectionId = (await addConnection()).id;
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("holds statuses, steps, existing-row choices, row statuses, reasons and fields to their lists", async () => {
    const refusals: [() => Promise<unknown>, string][] = [
      [() => addConnection({ status: "sleeping" }), "sheet_connection_status_value"],
      [() => addConnection({ step: "finish" }), "sheet_connection_step_value"],
      [() => addConnection({ existingRows: "all" }), "sheet_connection_existing_rows_value"],
      [() => addConnection({ rowsAdded: -1 }), "sheet_connection_counts"],
      [() => addConnection({ consecutiveFailures: -1 }), "sheet_connection_counts"],
      [() => addConnection({ cursorRow: 0 }), "sheet_connection_cursor_row"],
      [() => addConnection({ spreadsheetId: "short" }), "sheet_connection_spreadsheet_id_format"],
      [() => addConnection({ spreadsheetId: `${newSpreadsheetId()}/../x` }), "sheet_connection_spreadsheet_id_format"],
      [() => addColumn({ field: "stage" }), "sheet_column_field_value"],
      [() => addColumn({ field: "passport" }), "sheet_column_field_value"],
      [() => addColumn({ header: "x".repeat(201) }), "sheet_column_text_lengths"],
      [
        () =>
          inOrg((tx) =>
            tx.sheetValueMatch.create({ data: { connectionId, field: "stage", value: "Asha", matchedBy: "chosen" } }),
          ),
        "sheet_value_match_field_value",
      ],
      [
        () =>
          inOrg((tx) =>
            tx.sheetValueMatch.create({ data: { connectionId, field: "owner", value: "Asha", matchedBy: "name" } }),
          ),
        "sheet_value_match_matched_by_value",
      ],
      [
        () =>
          inOrg((tx) =>
            tx.sheetValueMatch.create({
              data: { connectionId, field: "owner", value: "x".repeat(201), matchedBy: "chosen" },
            }),
          ),
        "sheet_value_match_value_length",
      ],
      [() => addRow({ rawHash: nextHash(), status: "skipped" }), "sheet_row_status_value"],
      [() => addRow({ rawHash: nextHash(), reasons: ["no_phone"] }), "sheet_row_reasons_value"],
      [() => addRow({ rawHash: nextHash(), rowNumber: 0 }), "sheet_row_row_number_positive"],
      [() => addRow({ rawHash: nextHash(), occurrence: 0 }), "sheet_row_occurrence_positive"],
      [() => addRow({ rawHash: Buffer.alloc(31, 1) }), "sheet_row_hash_length"],
    ];
    for (const [insert, constraint] of refusals) {
      await expect(insert(), constraint).rejects.toThrow(new RegExp(`\\b${constraint}\\b`));
    }
    for (const status of ["connecting", "running", "paused", "lost_access", "tab_missing", "columns_missing"]) {
      await expect(addConnection({ status }), status).resolves.toBeDefined();
    }
    for (const status of ["needs_manager", "disconnected"]) {
      await expect(addConnection({ status }), status).resolves.toBeDefined();
    }
    for (const step of ["share", "tab", "columns", "existing", "done"]) {
      await expect(addConnection({ step }), step).resolves.toBeDefined();
    }
    for (const existingRows of ["only_new", "check"]) {
      await expect(addConnection({ existingRows }), existingRows).resolves.toBeDefined();
    }
    for (const field of sheetFields) await expect(addColumn({ field }), field).resolves.toBeDefined();
    await expect(addColumn({ field: null })).resolves.toBeDefined();
    for (const status of ["before_connect", "pending", "added", "merged", "duplicate", "not_added", "erased"]) {
      await expect(addRow({ rawHash: nextHash(), status }), status).resolves.toBeDefined();
    }
    await expect(
      addRow({
        rawHash: nextHash(),
        status: "not_added",
        reasons: ["no_name", "no_contact", "notes_too_long", "blocked", "erased", "could_not_add"],
      }),
    ).resolves.toBeDefined();
  });

  it("lets one live connection per spreadsheet and tab in an organization, and a second after the first is disconnected", async () => {
    const spreadsheetId = newSpreadsheetId();
    const first = await addConnection({ spreadsheetId, tabGid: "7", status: "running" });
    await expect(addConnection({ spreadsheetId, tabGid: "7" })).rejects.toThrow(/sheet_connection_live/);
    // Another tab of the spreadsheet, and another agency's connection to it, are different.
    await expect(addConnection({ spreadsheetId, tabGid: "8" })).resolves.toBeDefined();
    const other = await createTestOrganization(platform, "Same spreadsheet");
    await expect(addConnection({ spreadsheetId, tabGid: "7" }, other)).resolves.toBeDefined();
    await inOrg((tx) => tx.sheetConnection.update({ where: { id: first.id }, data: { status: "disconnected" } }));
    await expect(addConnection({ spreadsheetId, tabGid: "7" })).resolves.toBeDefined();
  });

  it("keeps a fingerprint only on an added, merged, duplicate or erased row", async () => {
    const fingerprint = hash(9);
    for (const status of ["added", "merged", "duplicate", "erased"]) {
      await expect(addRow({ rawHash: nextHash(), status, fingerprint }), status).resolves.toBeDefined();
    }
    for (const status of ["before_connect", "pending", "not_added"]) {
      await expect(addRow({ rawHash: nextHash(), status, fingerprint }), status).rejects.toThrow(
        /sheet_row_fingerprint_status/,
      );
    }
    await expect(addRow({ rawHash: nextHash(), fingerprint: Buffer.alloc(5) })).rejects.toThrow(
      /sheet_row_hash_length/,
    );
  });

  it("keeps examples to 120 characters and a tab title to 100", async () => {
    await expect(addRow({ rawHash: nextHash(), status: "not_added", exampleName: "x".repeat(121) })).rejects.toThrow(
      /sheet_row_example_lengths/,
    );
    await expect(addRow({ rawHash: nextHash(), status: "not_added", exampleValue: "x".repeat(121) })).rejects.toThrow(
      /sheet_row_example_lengths/,
    );
    await expect(
      addRow({ rawHash: nextHash(), status: "not_added", exampleName: "x".repeat(120), exampleValue: "y".repeat(120) }),
    ).resolves.toBeDefined();
    await expect(addConnection({ tabTitle: "x".repeat(101) })).rejects.toThrow(/sheet_connection_text_lengths/);
    await expect(addConnection({ tabTitle: "x".repeat(100) })).resolves.toBeDefined();
    await expect(addConnection({ tabTitle: "" })).rejects.toThrow(/sheet_connection_text_lengths/);
  });

  it("refuses the same hash and occurrence twice in a connection, and allows the same hash in two connections", async () => {
    const rawHash = nextHash();
    await addRow({ rawHash, occurrence: 1 });
    await expect(addRow({ rawHash, occurrence: 1 })).rejects.toThrow(/sheet_row_hash/);
    await expect(addRow({ rawHash, occurrence: 2 })).resolves.toBeDefined();
    const second = await addConnection();
    await expect(addRow({ connectionId: second.id, rawHash, occurrence: 1 })).resolves.toBeDefined();
    await expect(addColumn({ headerKey: "dup" })).resolves.toBeDefined();
    await expect(addColumn({ headerKey: "dup" })).rejects.toThrow(/sheet_column_key/);
  });

  it("lets the runtime role update every sheet table, and delete only rows, columns and value matches", async () => {
    const row = await addRow({ rawHash: nextHash() });
    const column = await addColumn({});
    const match = await inOrg((tx) =>
      tx.sheetValueMatch.create({ data: { connectionId, field: "owner", value: randomUUID(), matchedBy: "chosen" } }),
    );
    const contact = await inOrg((tx) => tx.sheetErasedContact.create({ data: { contactHash: nextHash() } }));
    await inOrg(async (tx) => {
      await tx.sheetConnection.update({ where: { id: connectionId }, data: { touchedAt: new Date() } });
      await tx.sheetColumn.update({ where: { id: column.id }, data: { isNew: true } });
      await tx.sheetValueMatch.update({ where: { id: match.id }, data: { target: userId } });
      await tx.sheetRow.update({ where: { id: row.id }, data: { rowNumber: 5 } });
      await tx.sheetErasedContact.update({ where: { id: contact.id }, data: { erasedAt: new Date() } });
    });
    await expect(inOrg((tx) => tx.sheetConnection.delete({ where: { id: connectionId } }))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(inOrg((tx) => tx.sheetErasedContact.delete({ where: { id: contact.id } }))).rejects.toThrow(
      /permission denied/i,
    );
    await inOrg(async (tx) => {
      await tx.sheetRow.delete({ where: { id: row.id } });
      await tx.sheetColumn.delete({ where: { id: column.id } });
      await tx.sheetValueMatch.delete({ where: { id: match.id } });
    });
  });

  it("purges an organization with sheets, their rows, a schedule row and a claim", async () => {
    const purged = await createTestOrganization(platform, "Purged sheets");
    const connection = await addConnection({}, purged);
    await db.forOrg(purged, async (tx) => {
      await tx.sheetColumn.create({ data: { connectionId: connection.id, headerKey: "name", header: "Name" } });
      await tx.sheetValueMatch.create({
        data: { connectionId: connection.id, field: "owner", value: "Asha", matchedBy: "chosen" },
      });
      await tx.sheetRow.create({
        data: { connectionId: connection.id, rawHash: hash(3), rowNumber: 2, status: "before_connect" },
      });
      await tx.sheetErasedContact.create({ data: { contactHash: hash(4) } });
    });
    await db.withoutOrg(async (tx) => {
      await sheetSchedule(tx).create({
        data: { id: connection.id, organizationId: purged, serviceAccountIndex: 0, nextCheckAt: new Date() },
      });
      await spreadsheetClaims(tx).create({ data: { organizationId: purged, spreadsheetHash: randomUUIDHash() } });
    });
    await expect(platformDb.transaction((tx) => deleteOrganizationRows(tx, purged))).resolves.toMatchObject({
      sheet_connection: 1,
      sheet_column: 1,
      sheet_value_match: 1,
      sheet_row: 1,
      sheet_erased_contact: 1,
      sheet_check_schedule: 1,
      sheet_spreadsheet_claim: 1,
      organization: 1,
    });
  });
});

function randomUUIDHash(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(randomUUID().replaceAll("-", "").repeat(2), "hex"));
}
