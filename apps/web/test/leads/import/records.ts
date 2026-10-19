// An import as leadImports.get answers, for the lead import screens' tests: a CSV of enquiries waiting at the
// columns' step unless a test changes it.
import type { ImportColumn, ImportCounts, ImportDetail } from "@travel-crm/contracts/imports";

export const importId = "0199e7a0-0000-7000-8000-0000000000e1";
export const asha = "0199a000-0000-7000-8000-0000000000a1";
export const ravi = "0199a000-0000-7000-8000-0000000000a2";

export const workers = [
  { userId: asha, name: "Asha Sharma" },
  { userId: ravi, name: "Ravi Kumar" },
];

export function aColumn(position: number, header: string, overrides: Partial<ImportColumn> = {}): ImportColumn {
  return { position, header, samples: [], values: [], field: null, guessedBy: null, ...overrides };
}

/** Name, Mobile No, Status (three values) and Assigned To (two): guessed, the first-seen way. */
export const columns: ImportColumn[] = [
  aColumn(0, "Name", { samples: ["Anita Verma", "Imran Shaikh"], field: "name", guessedBy: "common-name" }),
  aColumn(1, "Mobile No", { samples: ["98765 43210"], field: "phone", guessedBy: "last-time" }),
  aColumn(2, "Status", {
    samples: ["New", "Called"],
    field: "stage",
    guessedBy: "common-name",
    values: [
      { value: "New", rows: 612 },
      { value: "Called", rows: 301 },
      { value: "Booked", rows: 63 },
    ],
  }),
  aColumn(3, "Assigned To", {
    samples: ["Asha", "Ravi"],
    field: "owner",
    guessedBy: "common-name",
    values: [
      { value: "Asha", rows: 512 },
      { value: "Vikas", rows: 85 },
    ],
  }),
  aColumn(4, "Sr No", { samples: ["1", "2", "3"] }),
];

export const counts: ImportCounts = {
  byPlan: { new: 1053, returning: 41, enquiry: 63, blocked: 12, already_imported: 13, in_crm: 0, not_added: 104 },
  returning: 41,
  noted: 38,
  newStage: 755,
  notAdded: [
    { reason: "no_contact", rows: 71 },
    { reason: "not_a_lead", rows: 24 },
    { reason: "same_as_row", rows: 9 },
  ],
  inCrm: { open: 0, closed: 0 },
  newDestinations: ["Gulmarg", "Pahalgam", "Coorg", "Spiti", "Rann of Kutch"],
  outcomes: { added: 0, merged: 0, left_out: 0, not_added: 0 },
};

export function anImport(overrides: Partial<ImportDetail> = {}): ImportDetail {
  return {
    id: importId,
    kind: "leads",
    status: "matching",
    fileName: "enquiries-oct-2026.xlsx",
    fileKind: "xlsx",
    sheet: { name: "Leads Oct", count: 3 },
    unreadableReason: null,
    failureReason: null,
    sameFile: null,
    columns,
    valueMatches: [
      { field: "stage", value: "New", target: "new", matchedBy: "word" },
      { field: "stage", value: "Called", target: "contacted", matchedBy: "word" },
      { field: "stage", value: "Booked", target: "won", matchedBy: "word" },
      { field: "owner", value: "Asha", target: asha, matchedBy: "first_name" },
      { field: "owner", value: "Vikas", target: null, matchedBy: "none" },
    ],
    defaults: { stage: "new", ownerUserId: null, budgetBasis: null, roleKey: null },
    choices: { addBlocked: false, addAlreadyImported: false, addInCrm: false },
    sourceSheet: null,
    counts: null,
    progress: { rowsTotal: 1286, rowsToAdd: 0, rowsDone: 0, rowsAdded: 0, addRequestedAt: null },
    createdAt: "2026-10-19T10:30:00.000Z",
    checkedAt: null,
    finishedAt: null,
    keepUntil: "2026-10-26T10:30:00.000Z",
    report: null,
    ...overrides,
  };
}

/** An import at its preview, with the counts above. */
export function aCheckedImport(overrides: Partial<ImportDetail> = {}): ImportDetail {
  return anImport({
    status: "checked",
    counts,
    checkedAt: "2026-10-19T10:35:00.000Z",
    progress: { rowsTotal: 1286, rowsToAdd: 1157, rowsDone: 1286, rowsAdded: 0, addRequestedAt: null },
    ...overrides,
  });
}
