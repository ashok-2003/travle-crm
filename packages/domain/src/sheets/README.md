# sheets

Connecting an agency's Google Sheet and finding which of its rows are new (Sheets sync; spec
`docs/superpowers/specs/2026-10-19-sheets-sync-design.md`, ADR 0031). L0, beside `imports` and `exports`: crm calls it, and
it never calls crm or today. crm (`crm/lead-sheets/`) turns the rows this module finds into leads.

- **Limits** (`limits.ts`) are the only place a number is written: five sheets, 20,000 rows, 50 columns, 4,000
  characters a cell, the check every 900 seconds plus up to a third at random, 50 reads a minute for an account.
- **A sheet is read through the `GoogleSheets` port** (`@travel-crm/integrations/google-sheets`), read only. `google` and
  `hashes` are null when Google Sheets is not set up (`SHEETS_NOT_SET_UP`).
- **A row is known by its hash, never its place** (`hashes.ts`, `sheet_row`): `(raw_hash, occurrence)`.
- **A spreadsheet belongs to one agency at a time** (`claim.ts`): a keyed hash in `sheet_spreadsheet_claim`.
- **`schedule.ts` is the only file that names the two tables outside row-level security** (`sheet_check_schedule`,
  `sheet_spreadsheet_claim`), through `@travel-crm/db/sheet-schedule` inside `db.withoutOrg()`.
- **`beginSheet`** is "Check the sheet": one describe, the claim, and a draft connection under the agency's limit (an
  advisory lock on the agency, so two people connecting at once can't both take the last place).
