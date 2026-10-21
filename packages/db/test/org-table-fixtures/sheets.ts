// Isolation fixtures for the sheets module: a connection, a column, a value match, a ledger row and an erased contact.
// The runtime role deletes columns, value matches and ledger rows (disconnecting forgets them), never connections or
// tombstones. The check schedule and the spreadsheet claim are not here: they have no row-level security
// (unscopedScheduleTables in org-table-fixtures.ts).
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const aConnection = (tx: OrgTx) =>
  tx.sheetConnection.create({
    data: {
      spreadsheetId: randomUUID().replaceAll("-", "") + "isolation",
      tabGid: "0",
      tabTitle: "Form responses 1",
      sheetTitle: "Isolation",
      sheetLocale: "en_IN",
      sheetTimeZone: "Asia/Kolkata",
      serviceAccountIndex: 0,
      connectedBy: "0199e7a0-0000-7000-8000-0000000000b1",
    },
  });

export const fixtures: OrgTableFixtures = {
  sheet_connection: { create: aConnection, undeletable: true },
  sheet_column: {
    create: async (tx) =>
      tx.sheetColumn.create({ data: { connectionId: (await aConnection(tx)).id, headerKey: "name", header: "Name" } }),
  },
  sheet_value_match: {
    create: async (tx) =>
      tx.sheetValueMatch.create({
        data: { connectionId: (await aConnection(tx)).id, field: "owner", value: "Asha", matchedBy: "chosen" },
      }),
  },
  sheet_row: {
    create: async (tx) =>
      tx.sheetRow.create({
        data: {
          connectionId: (await aConnection(tx)).id,
          rawHash: Buffer.alloc(32, 1),
          rowNumber: 2,
          status: "before_connect",
        },
      }),
  },
  sheet_erased_contact: {
    // A hash no other fixture uses, since every fixture may run in one organization.
    create: (tx) =>
      tx.sheetErasedContact.create({
        data: { contactHash: new Uint8Array(Buffer.from(randomUUID().replaceAll("-", "").repeat(2), "hex")) },
      }),
    undeletable: true,
  },
};
