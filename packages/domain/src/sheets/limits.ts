// Every number the Sheets sync is bound by, written once (spec 4, Global Constraints). Changing a limit changes only
// this file.

/** At most this many sheets (drafts included) per agency (S8). */
export const maxSheetsPerOrganization = 5;

/** What one tab is read to (S15, S33): rows, columns, and characters in a cell. Past them nothing is kept or read. */
export const maxSheetRows = 20_000;
export const maxSheetColumns = 50;
export const maxCellLength = 4_000;
/** A Google answer is read as a stream up to this many bytes. */
export const maxResponseBytes = 25 * 1024 * 1024;

/** The connect-time import is offered the newest rows only (the bulk limit). */
export const connectImportMaxRows = 10_000;

/** A normal check reads this many rows before the cursor, so rows inserted or edited just above the end are met (S18). */
export const lookbackRows = 100;
/** The daily full read is the first check after this hour in the agency's zone. */
export const dailyFullReadHour = 3;

/** A sheet is checked every this many seconds while the worker is awake (S36). */
export const checkIntervalSeconds = 120;
/** How many sheets' checks run at once. */
export const checkConcurrency = 4;
/** Google allows 300 reads a minute for the project and 60 for one user: this leaves room for connects and Sync now. */
export const maxReadsPerMinutePerAccount = 50;
/** A dispatched or running check holds its sheet this long (S36). */
export const claimSeconds = 300;
/** Sync now is refused within this many seconds of the last check (S38). */
export const syncCooldownSeconds = 30;
/** The third failed scheduled check in a row is lost access (S39). */
export const lostAccessAfterFailures = 3;
/** "A check is saving" for an import's Add: its heartbeat is this recent (S12). */
export const checkHeartbeatSeconds = 30;
/** The sheet's page says checks are running late after this many minutes without one. */
export const lateAfterMinutes = 10;

/** Rows saved to a transaction by a check, and ledger rows written to a transaction by the baseline (S25, S14). */
export const rowsPerTransaction = 50;
export const baselineRowsPerTransaction = 1_000;

/** A Google request times out at this many seconds (S37). */
export const googleRequestTimeoutSeconds = 20;

/** A draft untouched this many hours is deleted (S6); resolved problems are dropped after this many days (S31). */
export const draftKeptHours = 24;
export const resolvedProblemKeptDays = 7;
/** A claim no live connection holds is dropped after this many hours (S5). */
export const unusedClaimKeptHours = 1;

/** How many sheets an agency may connect. Becoming a plan limit by tier changes only this function (S8). */
export function sheetLimitFor(organizationId: string): Promise<number> {
  // Today every agency has the same limit; a plan's would be read for this organization here.
  return Promise.resolve(organizationId === "" ? 0 : maxSheetsPerOrganization);
}
