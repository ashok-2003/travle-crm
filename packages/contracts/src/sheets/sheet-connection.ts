// A connected sheet as the api shows it (spec 3, 6.5): its status and attention state, the steps of connecting, and the
// lists and outputs the screens read. Outputs are z.object, which strips unknown keys.
import { z } from "zod";
import { leadImportFields, type LeadImportField } from "../crm/lead-import.js";
import { recordId } from "../identity/fields.js";
import { valueMatchedBy } from "../imports/import-columns.js";

export const sheetStatuses = [
  "connecting",
  "running",
  "paused",
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
  "disconnected",
] as const;
export const sheetStatus = z.enum(sheetStatuses);
export type SheetStatus = z.infer<typeof sheetStatus>;

/** The states that stop rows and are told to the Owner once (S45). */
export const attentionStates = ["lost_access", "tab_missing", "columns_missing", "needs_manager"] as const;
export const attentionState = z.enum(attentionStates);
export type AttentionState = z.infer<typeof attentionState>;

/** Where the connect screens are. */
export const sheetSteps = ["share", "tab", "columns", "existing", "done"] as const;
export const sheetStep = z.enum(sheetSteps);
export type SheetStep = z.infer<typeof sheetStep>;

/** What to do with the rows already in the sheet (S14). */
export const existingRowChoices = ["only_new", "check"] as const;
export const existingRowChoice = z.enum(existingRowChoices);
export type ExistingRowChoice = z.infer<typeof existingRowChoice>;

/** A sheet column holds a lead import field, without stage: a new row is always New (S22). */
type SheetFieldName = Exclude<LeadImportField, "stage">;
export const sheetFields = leadImportFields.filter((field) => field !== "stage") as [
  SheetFieldName,
  ...SheetFieldName[],
];
export const sheetField = z.enum(sheetFields);
export type SheetField = z.infer<typeof sheetField>;

/** The fields whose values are matched one at a time: only the Owner (S22). */
export const sheetValueFields = ["owner"] as const;

/** Where a column's field came from; a sheet adds Google Forms' own headers and words in a header (S12). */
export const sheetGuessSources = ["last-time", "form", "common-name", "word"] as const;

const timestamp = z.iso.datetime();

export const sheetListItem = z.object({
  id: recordId,
  sheetTitle: z.string(),
  tabTitle: z.string(),
  status: sheetStatus,
  attentionState: attentionState.nullable(),
  lastCheckedAt: timestamp.nullable(),
});
export type SheetListItem = z.infer<typeof sheetListItem>;

export const sheetList = z.object({
  items: z.array(sheetListItem),
  /** How many sheets an agency may connect (S8). */
  limit: z.int(),
  /** The addresses to share a sheet with: one for each service account. */
  serviceAccountEmails: z.array(z.string()),
  /** False when Google Sheets isn't set up on this server (S9). */
  configured: z.boolean(),
});
export type SheetList = z.infer<typeof sheetList>;

export const sheetDetail = z.object({
  id: recordId,
  sheetTitle: z.string(),
  tabTitle: z.string(),
  tabGid: z.string(),
  status: sheetStatus,
  step: sheetStep,
  attentionState: attentionState.nullable(),
  attentionSince: timestamp.nullable(),
  connectedBy: z.object({ userId: recordId, name: z.string().nullable() }).nullable(),
  connectedAt: timestamp.nullable(),
  /** The address the agency shared the sheet with. */
  serviceAccountEmail: z.string(),
  lastCheckedAt: timestamp.nullable(),
  /** A check is running now, so the page asks again soon. */
  checkRunning: z.boolean(),
  /** The last check is more than ten minutes old, though the sheet is running. */
  late: z.boolean(),
  /** The agency can't change anything today (suspended or lapsed). */
  readOnly: z.boolean(),
  /** The tab holds more rows than are read (S15). */
  rowsTruncated: z.boolean(),
  counts: z.object({
    added: z.int(),
    mergedIntoExisting: z.int(),
    duplicates: z.int(),
    couldntBeAdded: z.int(),
  }),
  columns: z.object({
    matched: z.int(),
    total: z.int(),
    /** Headers the sheet gained that nobody matched (S15). */
    newUnmatched: z.array(z.string()),
    /** Matched columns the sheet no longer has. */
    missing: z.array(z.string()),
  }),
  existingRows: existingRowChoice.nullable(),
  /** The connect-time import, when the second choice was made. */
  existingImportId: recordId.nullable(),
  /** Who owns new leads when no owner column matches: the agency Owner. */
  defaultOwnerName: z.string().nullable(),
});
export type SheetDetail = z.infer<typeof sheetDetail>;

export const sheetColumnView = z.object({
  headerKey: z.string(),
  header: z.string(),
  samples: z.array(z.string()),
  field: sheetField.nullable(),
  guessedBy: z.enum(sheetGuessSources).nullable(),
  /** The sheet gained this header and nobody has seen it. */
  isNew: z.boolean(),
});

export const sheetColumnsView = z.object({
  sheetTitle: z.string(),
  tabs: z.array(z.object({ gid: z.string(), title: z.string() })),
  tabGid: z.string(),
  /** How many rows the tab holds below the header. */
  rowCount: z.int(),
  columns: z.array(sheetColumnView),
  /** The Owner column's distinct values with their rows, when a column is matched to Owner. */
  ownerValues: z
    .array(
      z.object({
        value: z.string(),
        rows: z.int(),
        target: recordId.nullable(),
        matchedBy: z.enum(valueMatchedBy),
      }),
    )
    .nullable(),
});
export type SheetColumnsView = z.infer<typeof sheetColumnsView>;
