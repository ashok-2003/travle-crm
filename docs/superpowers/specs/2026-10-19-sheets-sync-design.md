# Google Sheets sync: enquiries from the agency's sheet, one way

- **Status:** draft for the owner, 2026-10-19. The owner's ten decisions of the same day (settled with the project
  manager) are binding and are marked "owner" below. The screens and the calls in section 15 are for the owner to
  approve.
- **Date:** 2026-10-19
- **Scope:** Phase 1, build step 2: connect a Google Sheet, bring its rows into the CRM as leads by themselves, one way
  only (sheet to CRM). Nothing is ever written to a sheet.
- **Input:** the bulk spec (`2026-10-19-bulk-in-and-out-design.md`, which says "B" for its rules; sections 4.2-4.5 and
  14), its plan (`../plans/2026-10-19-bulk-in-and-out.md`, Part 0), the Phase 1 product scope (section 3.1),
  ADR 0028 (data rules), `CLAUDE.md`, `DESIGN.md`.
- **Mockup:** `2026-10-19-sheets-sync-screens.html`, beside this file. Where it and this text differ, this text wins.

## 1. Why this feature

Most agencies already collect enquiries with a Google Form: a Facebook ad, an Instagram bio or a WhatsApp status points
to a form, and every answer becomes a row in a Google Sheet. Today someone copies those rows into the CRM, or the
enquiry waits in the sheet. This feature connects the sheet once; its rows then arrive as leads by themselves, and the
team works them in the CRM. The sheet stays the agency's own: we only read it.

**Goals**

- An Owner connects a sheet in about three minutes, with a link and one share, and a new form answer is a lead within
  about fifteen minutes (when our servers are awake; Sync now at once), with an owner and a notice.
- **No duplicates, whatever the agency does:** several campaign sheets with the same people in them, people already
  handled by hand, rows sorted, inserted, deleted or the sheet connected twice by mistake. A person is one person and
  has one open lead.
- Rows that can't be added are listed with a reason the agency can read, and fixing the row in the sheet is enough.
- Losing access to the sheet is noticed, said plainly with how to fix it, and told to the Owner once.

**Non-goals (later, or never)**

- Writing anything to the sheet: no CRM tab, no status column, no write-back (owner). "Sign in with Google" (the
  `drive.file` scope and Google's Picker, so an agency picks a sheet without sharing an address) is future work; the
  tables and the port are shaped so it can replace the share step without touching the rest (section 6.1).
- Google Drive push notifications (`files.watch`): they carry no detail, and their channels expire within a day, so
  they would still need polling. Out of scope.
- Reading more than one tab per connection (a second tab is a second connection), Excel files stored in Drive, and
  following edits to a row after it was added (S28).
- A plan limit by tier: the limit of 5 sheets is one constant, ready to become a plan limit later (S8).

**Anti-goals:** a second lead for a person who already has an open one; a row added twice because the sheet was sorted;
a key or token in a log; a sheet connected to two agencies at once (S4); a sheet of
10,000 rows that brings the worker to a halt.

## 2. Who uses it

- **Connecting, pausing, disconnecting and watching a sheet:** whoever holds both `leads:create` and `leads:assign`
  (the Owner, the Admin starter role, any role an agency gives both). This is the bulk spec's rule for imports
  (section 2 there), for the same reason: a sheet decides owners for leads that may not be the connector's.
- **Everyone else** sees the leads the sheet brought in like any lead, with source "Google Sheet" and the sheet's
  name; they don't see the sheets or the rows that couldn't be added (those show customers' names).
- **The agency Owner** gets the notices (section 8). **Platform staff** see nothing new except the sheets' counts on
  an organization's page.

## 3. The screens

Built from the registry components and the shared pieces (`CLAUDE.md`, bulk section 3), mobile first, each with its
loading, empty, error-with-retry and refusal states. A change's button asks `useWriteAccess("change")`; Pause and
Disconnect ask `useWriteAccess("revoke")` (open while read-only, S44). Words in `sheets.json`.

### 3.1 Lead sources (Settings)

A new page under Settings, **Lead sources** (`/settings/lead-sources`), for those who may connect sheets. The later
releases' Meta lead ads and website form join it, which is why it isn't named "Google Sheets". `PageHeader` "Lead
sources", a sentence ("Enquiries your agency collects elsewhere arrive here by themselves. We only read your sheets:
nothing is ever written to them."), then **Google Sheets**: an `ItemGroup` of the connected sheets and **Connect a
sheet** (primary).

Each sheet is an `Item`: its name ("Goa Diwali campaign"), the tab ("Form responses 1" in the description), "Last
checked 10:42" in the agency's zone, and a `StatusBadge`: **Running** (green), **Paused** (neutral), **Needs
attention** (amber), **Lost access** (red). The sheet's name links to its page. An agency with no sheet sees an
`EmptyState` ("No sheets connected yet. Connect the sheet your Google Form fills, and new enquiries become leads by
themselves."). At five sheets, **Connect a sheet** is disabled with its hint ("You can connect up to 5 sheets. Disconnect
one to connect another.", `WriteHint`). Where Google isn't set up on the server (development), the page says so and
the button is off (S9).

### 3.2 Connect a sheet

One address (`/settings/lead-sources/sheets/<sheetId>/connect`) once the link is checked, so leaving and coming back
finds the same step (as an import does). Steps are a caption under the title ("Step 2 of 3 · Match columns").

1. **Share and paste** (`/settings/lead-sources/sheets/connect`). Two numbered `Item`s:
   1. "Share your sheet with this address" with the address in a read-only `InputGroup` and a `CopyButton`, and a line
      under it: "In your sheet, press Share, paste the address and choose Viewer. We can only read, never change."
   2. "Paste the sheet's link" with a text field (link of the sheet from the browser's address bar; a link to one tab
      picks that tab).
   Then **Check the sheet** (primary). Each way it can fail has its own sentence under the field (S5): not shared yet
   ("We can't open that sheet yet. Share it with <address> as a Viewer, then check again."), a link that isn't a
   Google Sheet, an Excel file kept in Drive, already connected here, already connected elsewhere ("This sheet is already connected elsewhere."), and the limit.
2. **Tab and columns.** "Sheet 'Goa Diwali campaign (Responses)'" and a `Select` of its tabs when it has more than
   one (the link's tab first). Then the bulk spec's **Match columns** step, unchanged: `ColumnMatcher` with each of
   the sheet's headers, up to three sample values and a `Select` of what it holds ("Don't import" first), the guesses
   filled in (S12), the checklist of what is needed (Name, and a phone, email or Instagram), and for a column matched
   to **Owner** the `ValueMatcher` with each value's rows ("Asha" to Asha Sharma; anything else to the agency Owner).
   There is no Stage field (S22) and no "Rows with no stage" question here. **Next** (primary).
3. **Rows already in the sheet** (S14). "Your sheet already has 1,286 rows. What should we do with them?", two
   choice cards (as the export's format card): **Only new rows from now on** (chosen; "Nothing already in the sheet is
   added. New answers become leads.") and **Also check the 1,286 rows already there** ("You'll see a preview first.
   Anyone who already has a lead with you is left out unless you tick them."). A sheet with no rows skips this
   step. **Connect the sheet** (primary) asks once (`ConfirmDialog`): "Connect 'Goa Diwali campaign'? New rows will
   become leads about every 15 minutes. Sync now brings them at once. We never change your sheet." Then "Reading your sheet…" and, for the first
   choice, the sheet's page; for the second, the import's preview (3.3).

### 3.3 Rows already in the sheet: the import's preview with one more group

The second choice makes an ordinary lead import (bulk section 3.2, step 3), named after the sheet ("Goa Diwali
campaign · 19 Oct"), with the sheet's rows as its file. Its Check step is the bulk preview with these differences:

- **Your choice** gains **Already in your CRM**, beside the blocked contacts and rows already imported, each left out
  unless its `Checkbox` is ticked: "212 rows are for people who already have a lead with you (140 with an open lead,
  72 with only closed leads). Left out unless you tick them." Ticked, a row on an open lead becomes a repeat enquiry
  on it and one whose leads are all closed becomes a new lead marked Returning (B15).
- The default-stage question stays ("Rows with no stage get: New"): an old sheet's rows are usually not New.
  The match steps are not repeated: the columns were matched in 3.2.
- A caption says where the rows came from: "From your Google Sheet 'Goa Diwali campaign'. New rows added to the sheet
  meanwhile are being added by the sheet itself."

Add, Done, the report of rows not added and Recent imports are the bulk spec's, unchanged. The import's rows do not
come back from the sheet afterwards (S14).

### 3.4 The sheet's page

`/settings/lead-sources/sheets/<sheetId>`: `BackLink` to Lead sources, `PageHeader` with the sheet's name and its
badge, "Tab 'Form responses 1' · connected by Asha Sharma on 12 Oct", and the actions **Sync now** (outline) and a
`DropdownMenu` (**Match columns again**, **Pause**, **Take over**, **Disconnect**).

- **Last checked 10:42** (the agency's zone; "18 Oct, 10:42" for another day) with **Sync now** beside it, which shows
  "Checking…" and then the new time. When the last check is more than ten minutes old, a quiet line: "Checks are
  running late. Sync now checks it at once." (the pilot's worker sleeps, S36.)
- **Counts**, as `Card`s (mono numbers) since the sheet was connected: **Added** (new leads, returning customers
  included), **Added to an existing lead**, **Left out as duplicates**, **Couldn't be added**. A line under them:
  "Rows already in the sheet when you connected are not counted."
- **Couldn't be added**, when there are any: a `Table` on a computer and an `ItemGroup` on a phone, one row each: the
  sheet row ("Row 87"), the name or a value if there is one ("Rahul Sharma"), the reason in a sentence ("No phone,
  email or Instagram we can use"), "First seen 18 Oct", and **Hide** (ghost, S31). Under it: "Fix the row in your
  sheet. The next check adds it and clears this line. We never change your sheet." Fifty at a time with
  `ShowMoreButton`.
- **Columns**: "6 of 9 columns are matched" with **Match columns again** (the 3.2 step, saved with a
  `ConfirmDialog`: "Rows already added are not added again."), and, when the sheet has gained a column nobody
  matched, a quiet "A new column 'Budget for the trip' isn't matched" linking to it (S15).
- **Details**: the sheet's name and tab, who owns new leads when no owner column matches (the agency Owner), and
  "New leads come in as New".

### 3.5 Attention and lost access

An `Alert` at the top of the sheet's page, in place of the "Last checked" line's good news, and the badge on the list.
Each says what happened, since when, and the one thing to do:

- **Lost access** (S39): "We can't open this sheet any more. Last checked 10:42 on 18 Oct. It may have been unshared
  or deleted. Share it again with <address> as a Viewer, then press Check again." with the address and `CopyButton`,
  **Check again** (primary). Rows that arrive meanwhile wait in the sheet and are added once access is back.
- **Tab missing** (S40): "The tab 'Form responses 1' isn't in this sheet any more. Choose another tab" with a
  `Select` and **Use this tab** (the sheet is read from that tab; rows already seen are not added again).
- **Columns missing** (S15): "The columns 'Mobile No' and 'Email' are gone from the sheet, so we can't tell who the
  enquiries are from. Put them back or match other columns." with **Match columns again**. Nothing is read past the
  gap: rows wait in the sheet.
- **Needs a manager** (S34): "Asha Sharma, who connected this sheet, can't manage lead sources any more. Take it over
  to keep it running." with **Take over**.
- **Read-only agency** (S44): "Paused while your subscription is read-only. Rows wait in the sheet and are added when
  it's active again."
- **Paused** (S41): "Paused. Rows added to the sheet meanwhile will be added when you resume." with **Resume**.
- **Google is busy** (S37): not an `Alert`; the "Last checked" line keeps the last good time.

### 3.6 Disconnecting

**Disconnect** is a `ConfirmDialog`: "Disconnect 'Goa Diwali campaign'? Leads already added stay. We stop reading the
sheet and forget its rows' record, so connecting it again asks about its rows once more. Nothing in your sheet
changes; you may also remove <address> from its sharing." The sheet leaves the list; its counters are kept in the audit
entry.

## 4. How it behaves

### 4.1 Connecting

- **S1. One way, read only.** The Google scope is `https://www.googleapis.com/auth/spreadsheets.readonly`. The port has
  no method that writes (section 6.1), so no code path can change a sheet. A test lists the port's methods.
- **S2. Shared with our address (owner).** Each connection names one of the server's service accounts
  (`service_account_index`, S35) and the page shows that account's email. A Viewer share is enough. Nothing else is
  asked of the agency.
- **S3. The link.** Only `https://docs.google.com/spreadsheets/d/<id>/...` is accepted, by one contract schema
  (`sheetLink`) that extracts the spreadsheet id (letters, digits, `-` and `_`, 20 to 80 characters) and the optional
  `gid` of a tab. The URL is never fetched: the id alone goes to Google's API, as an encoded path segment.
- **S4. One spreadsheet, one agency at a time (owner: no proof step).** Connecting is sharing and pasting, nothing
  more (owner, 2026-10-19). The owner accepted the risk that someone holding a sheet's link could connect it to their
  own agency, since one service account can read every sheet shared with it. One quiet safeguard adds no step: a
  spreadsheet can be connected to only one agency at a time. `sheet_spreadsheet_claim` (section 5) holds
  `HMAC-SHA256(SHEETS_HASH_KEY, spreadsheet id)`, unique across all agencies. Connecting takes the claim (the
  agency's own second tab of the same spreadsheet finds it already theirs); a second agency finds it taken and is
  refused with one generic sentence, `SHEET_CLAIMED_ELSEWHERE`: "This sheet is already connected elsewhere." It
  says nothing of who, when or what. A lost race (two claims at once) is the same unique violation and the same
  sentence. The claim is released when the agency's last connection to that spreadsheet is disconnected or its
  draft deleted. What the safeguard doesn't stop: whoever connects a sheet first, if they hold its link, gets it.
- **S5. What "Check the sheet" does.** One `describe` call (title, locale, time zone, tabs with their `gid` and
  titles, whether each is a grid, and the first row of the chosen tab and three rows below it for the samples). It
  fails with one reason, each with its sentence in `errors.json`: `SHEET_LINK_INVALID`, `SHEET_NOT_SHARED` (Google
  answers 403 or 404 and we can't tell which: both say "share it"), `SHEET_NOT_GOOGLE_SHEET` (Google answers "not
  supported for this document": an Excel file in Drive), `SHEET_ALREADY_CONNECTED`, `SHEET_CLAIMED_ELSEWHERE`,
  `SHEET_LIMIT_REACHED`, `SHEETS_NOT_SET_UP`, `SHEET_EMPTY` (no header row).
- **S6. A draft connection** (`connecting`) is made at the first good check and keeps the step the person is at. It
  counts toward the limit (S8). The console's sweep deletes a draft untouched for 24 hours and releases its claim (S4).
- **S7. The same sheet and tab once per agency.** A second connection to the same spreadsheet and tab is refused
  (`SHEET_ALREADY_CONNECTED`: "This sheet is already connected as 'Goa Diwali campaign'.") by a partial unique index
  on `(organization_id, spreadsheet_id, tab_gid)` over connections not disconnected. Different tabs of one
  spreadsheet are different connections.
- **S8. At most 5 sheets per agency** (owner): `maxSheetsPerOrganization = 5` in
  `packages/domain/src/sheets/limits.ts`, the only place the number is written. Counted among connections not
  disconnected, drafts included, under the organization's row lock (`FOR NO KEY UPDATE`, as Add staff does), so two
  people connecting at once can't both take the last place. Becoming a plan limit by tier later means this function
  reads `planLimits` instead; nothing else changes.
- **S9. Not set up.** With no service account configured (a development machine), `describe` fails with
  `SHEETS_NOT_SET_UP` and the Lead sources page says so. The demo is such an organization (section 10).
- **S10. Who acts.** The connection is held by the member who confirmed it (`connected_by`). Every check resolves their
  access afresh, as the bulk spec's B31 does for an importer, and the leads it makes are theirs in the audit log, with
  source `job` ("Asha Sharma, from the sheet 'Goa Diwali campaign'"). Another manager may **Take over** (S34).

### 4.2 Matching columns

- **S11. Columns are held by their header, not their position** (`header_key`, the bulk's `headerKey`), so a column
  inserted or moved in the sheet changes nothing. A repeated header is named "(2)" as B3 does. A blank header is named
  by its letter and can be matched only by position, so it is read as "Column C" and flagged when it moves.
- **S12. Guesses** are the bulk spec's B9 (the agency's last match for the same header first, then the common names)
  with two additions that only a sheet needs, both used for guessing only and always shown for the person to
  confirm: Google Forms' own headers ("Timestamp" is Enquiry date, "Email Address" is Email, "Full name", "Phone
  number", "WhatsApp number" and the like) and, when no common name fits, a word inside the header (a header with
  "phone", "mobile" or "whatsapp" is Phone; with "email" or "mail" Email; with "name" Name; with "destination", "place" or
  "package" Destination; "adults", "persons" or "pax" Adults; "budget" Budget; "date" or "when" Travel from; "message", "remarks" or
  "requirement" Note). This is `guessFields`' option `wordsInHeader`, off for files.
- **S13. Fields.** The lead import's fields (B8), without Stage (S22). Several columns may go to Note: a form's
  extra questions are kept as "Do you need visas?: Yes" lines in the lead's note. Needed: Name, and one of Phone,
  Email and Instagram. Matches are remembered as header memory (B10) and shared with file imports of the agency.

### 4.3 Rows already in the sheet (owner)

- **S14. Asked once, "Only new rows from now on" by default.** On Connect the worker reads the whole tab and, always,
  writes a **baseline**: every row present is recorded as `before_connect` (its hash only, S19), and the cursor is
  put after the last row (S16). So nothing present at connect time is ever added by the sync, whatever the choice
  and however the sheet is sorted later. With "Also check the rows already there", the worker also writes the rows as
  a CSV (through the spreadsheets port's writer) stored as an import's file, and starts an ordinary lead import
  from it (3.3): its rows are read, matched, checked and added by the bulk release's own pipeline. The
  import's added rows keep their fingerprints (B33), which new rows check against (S23).
- **S15. A sheet with more than the rows we read.** A tab is read to 20,000 rows (`maxSheetRows`), 50 columns and 4,000
  characters a cell, as B2 limits a file, scaled to a sheet that grows. Past 20,000 the rest are not read and the page
  says so ("Only the first 20,000 rows are read. Move older rows to another tab."). For the connect-time import
  only the last 10,000 rows are offered (the bulk limit), with the sentence "Your sheet has 14,200 rows; the
  newest 10,000 can be checked." A matched column that disappears from the sheet is `columns missing` when it leaves the
  row with no Name, or no phone, email or Instagram; any other missing column is only noted, and a new unmatched
  column is a quiet line on the page. While columns are missing, no row is consumed.
- **S16. Which rows exist is decided by their hash, never by their place.** See section 4.4.

### 4.4 Finding new rows: a cursor and fingerprints

- **S17. One request to look.** A check makes one `values.batchGet` call (one read for the quota) of the header row
  and the rows from `fromRow` to the end of the tab, as displayed text (`FORMATTED_VALUE`: a phone keeps its leading
  zero and a date is read day first as B20 asks; a formula's result, never the formula). Hidden rows are read.
- **S18. The cursor and the window.** The connection keeps `cursor_row`, the last row number it has read. A normal check
  reads from `cursor_row - 100` (`lookbackRows`), so rows inserted or edited just above the end are met again. A
  **full read** (from row 2) happens when the person presses Sync now, on the first check after 03:00 in the agency's
  zone each day, after a header change, when the sheet has fewer rows than the cursor (rows were deleted), and at
  connect. Every read starts from the stored cursor, never from "the last two minutes": pg-boss doesn't run the ticks it missed
  while a process slept, so after a sleep of an hour the next check reads every row since the last one read, and
  nothing is skipped. Sync now reads from the top, which includes everything the cursor would. A form appends at the end, so the normal check reads a few dozen rows however long the sheet is; a sort or
  an insert in the middle is met by the daily full read, at the latest.
- **S19. A row's identity is its hash.** `raw_hash` is the SHA-256 of the JSON array of the row's cell texts (each
  trimmed, trailing empty cells dropped), with `occurrence` counting identical rows in the sheet (two exact copies
  are two rows). A row whose `(raw_hash, occurrence)` the connection already has is **known** and is never read into
  an enquiry again: sorting, inserting or deleting rows changes only row numbers, which are kept for the problem
  list and nothing else. Deleting a row changes nothing (owner). Rows that are all blank are skipped.
- **S20. A cursor can be wrong without harm.** If the cursor ran ahead (a sort moved rows past it) or fell behind
  (rows deleted), the daily full read, or Sync now, finds every row not known. If the whole sheet were wrongly
  forgotten, S14's baseline and S23 still stop duplicates (section 4.5); the cursor only saves bytes.

### 4.5 A row becomes a lead (no duplicates, owner)

Each new row goes through the bulk release's `readLeadRow` (B14, B19-B23) and crm's one save path
(`saveEnquiry`, the import's option), with the connector as actor.

- **S21. Same rules as an import.** B14 (the person: found by phone, else email, else handle; keeps their name; gains
  contacts they lack, never one another person holds), B15 (below), B16 (blocked), B20-B22 (the trip, a value we can't
  read kept in the note, the note), with these changes:
  - **Source** `google_sheet` ("Google Sheet"), detail the sheet's name and tab cut to 120 characters
    ("Goa Diwali campaign · Form responses 1"), followed by a Their source cell if one is matched.
  - **Enquiry date** is read with its time when the cell has one ("19/10/2026 14:32:10", in the sheet's own time
    zone, stored in UTC), because a Google Form's timestamp is the moment the person wrote, and the lead's
    "waiting for a reply since" should be true. A date only is the start of that day; a date in the future is the
    moment of reading.
- **S22. Stage and owner (owner).** A new row is always New, so the sheet's page offers no Stage field and no
  default-stage question. Owner: the matched Owner column's value through B11's rules (a lead worker's full name,
  username, email or unique first name; anything else, or an empty cell, to the agency Owner), where a value the
  agency matched by hand in the `ValueMatcher` wins. The agency Owner is identity's `firstOwner`, found afresh.
- **S23. Duplicates, in the order they are checked** (the first that applies decides):
  1. **Known row (S19):** left out, not counted.
  2. **An erased customer (S43):** left out, counted under "Couldn't be added" with the reason "A customer who asked to be
     erased", showing no name.
  3. **Blocked contact (B16):** left out and listed under "Couldn't be added" ("Blocked contact"). New rows have no
     "Add anyway": unblock the contact, and the next Sync now adds the row.
  4. **Same as a row already added, anywhere (B33):** the row's fingerprint is `rowFingerprint("leads", values)`,
     the bulk release's function over the row's matched values as read (contacts as stored, the trip, the owner
     value, the note text, the Enquiry date), without the sheet's identity, so it is the same for two sheets, a sheet
     and a file import, and a row typed twice. It is looked up in `import_row` (through `earlierFingerprints`) and in
     the sheets' own rows (`sheet_row`), in one query each for the whole check. A match: "Left out as a duplicate".
  5. **A person with an open lead:** the row becomes a **repeat enquiry on that lead**, never a second lead (B15),
     counted as "Added to an existing lead". This holds across every sheet, every import and every lead typed
     in by hand, because the person is found by contact, not by where the row came from.
  6. **A known person whose leads are all closed:** a new lead marked **Returning** (B15, owner: a new form fill is a
     fresh enquiry). Counted as "Added".
  7. **Anyone else:** a new person and a new lead. Counted as "Added".
- **S24. Rows in one check meet each other.** A later row of the same check for the same person meets the lead an
  earlier row made (so it is a repeat enquiry), and one whose fingerprint equals an earlier row of the check is a
  duplicate: the check keeps the plan and the fingerprints of its rows in a map, as the bulk check does.
- **S25. Transactions.** Rows are saved 50 to a transaction. Each transaction first holds the connection's row (so two
  runs of one check take turns), looks up its rows' contacts, open leads and blocked contacts at once, saves each
  row, and writes the row's outcome in `sheet_row` with its lead and person ids and its fingerprint (added and
  merged rows). A unique violation (someone added the same contact meanwhile) runs the transaction again once, as B26
  does. A row with an outcome is never saved again (B27), so a retried job carries on.
- **S26. Not while an import adds.** A check does nothing, and tries again at the next minute, while another lead import
  of the agency is adding (B29): two writers of overlapping people would turn each other's new leads into repeat
  enquiries. The same goes the other way: Add on an import is refused while a sheet check is saving rows, with
  B29's sentence (the check holds for seconds).
- **S27. A row that can't be added** is stored as `not_added` with its reason and the first cell's text (at most 120
  characters, the name when matched) and shown on the sheet's page (3.4). The reasons are B24's that apply to a
  single row: no name; no phone, email or Instagram we can use; notes over 4,000 characters; plus blocked contact
  and erased customer (S23). A value we can't read does not stop a row: it goes into the note (B21).
- **S28. Edits are new rows (owner confirmed).** A row edited after it was read has a new hash and is read as a new row. If it names a
  person with an open lead it becomes a repeat enquiry on that lead, never a second lead; if the edit fixed a row that
  couldn't be added, the old entry clears itself (S31). The sheet's page says so under "Counts" ("Changing a row
  after it was added adds a repeat enquiry"). Following edits into the lead is out of scope.
- **S29. A row that is not finished waits one check.** A row without a name, or without a usable contact, is held
  (`pending`) and read again at the next check, in case someone is still typing it. If it is still unfinished then it
  becomes `not_added`. A row with a name and a contact is added at once: a form's answer arrives whole, and the
  reply clock is running. Sync now ends the wait.
- **S30. Counts** are counters on the connection (`rows_added`, `rows_merged`, `rows_duplicate`), updated in the row's
  own transaction, so they are exact and cheap; **Couldn't be added** is the number of unresolved problems. A
  duplicate within a check or against a file import counts once.
- **S31. Problems clear themselves.** A `not_added` row whose hash is no longer in the sheet (it was fixed, edited or
  deleted) is marked resolved at the next read that covers its place (a full read always does). **Hide** marks one
  resolved by hand; nothing else removes it. Resolved problems are dropped after 7 days.
- **S32. Notifications of the leads** (section 8): a check that adds up to 5 leads or repeat enquiries for one owner
  sends the usual "New lead assigned to you" and "Repeat enquiry on your lead", each with the sheet as its source
  (`saveEnquiry`'s import option gains `notify: "each" | "none"`, imports pass "none"); more than 5 for one owner in
  one check send one summary instead (the connect-time import and a long outage are such cases).
- **S33. Reading is bounded.** A sheet's text is data: nothing in a cell is run, a cell is cut at 4,000 characters, the
  response is read as a stream up to 25 MB, and rows of the response past `maxSheetRows` are dropped. A test feeds
  the in-memory Google a sheet of a million rows, a 10 MB cell and a header of 5,000 columns.
- **S34. The connector may go.** When the connecting member is no longer a member, or lost `leads:create` or
  `leads:assign`, the sheet becomes **Needs a manager**: no rows are read, the Owner is told once (section 8), and any
  manager may **Take over** (`connected_by` becomes them; one audit entry), after which the rows that waited
  are added.

### 4.6 Checking, and the limits Google sets

- **S35. Service accounts.** The server holds one or more (`GOOGLE_SHEETS_SERVICE_ACCOUNTS`, section 14). A new
  connection is given `service_account_index = hash(connection id) mod number of accounts`, and keeps it for life
  because the agency shared the sheet with that address; adding an account only changes where later connections go.
  Google allows 300 reads a minute for the project and 60 a minute for one user, so one service account serves
  about 800 sheets at the 15-minute pace (a check is one or two reads, S17, at 50 a minute). `maxReadsPerMinutePerAccount = 50` leaves room for
  connects and Sync now. Past that the dispatcher (S36) checks the most overdue first, so the interval stretches and
  no sheet starves; the owner is told to add an account at about 400 sheets for one (section 14).
- **S36. About every 15 minutes while the worker is awake (owner, changed 2026-10-20 from 2).** Each check's next time is the interval plus a random 0 to 5 minutes (`spreadCheckSeconds`), and a new connection's first scheduled check is at a random moment within its first interval (`firstCheckSeconds`), so agencies' sheets never all read Google in the same minute. A wait Google asked for (a hold) is kept as it is. Sync now is the way to get rows at once. "Late" is after 30 minutes.  The worker holds the schedule. A scheduled job of the
  worker (`sheets.dispatch-checks`, every minute, the finest granularity pg-boss schedules have) claims the due rows
  of `sheet_check_schedule` (section 5) and queues one `sheets.check` job for each, with ids only. The schedule is a
  small table outside row-level security, so the worker can find due sheets of every organization without reading any
  organization's data; the job then runs the check in its organization through `forOrg`. The claim is
  `SELECT ... WHERE next_check_at <= now() AND (claimed_until IS NULL OR claimed_until < now()) ORDER BY
  next_check_at FOR UPDATE SKIP LOCKED LIMIT n`, at most `maxReadsPerMinutePerAccount` per account, most overdue
  first (S35), setting `claimed_until` five minutes ahead so a sheet already queued is not queued again. A check's
  end sets `next_check_at = now + 120 seconds` and clears the claim. The queue runs four checks at a time
  (`concurrency` 4). The worker sleeps on Render's free tier and wakes when agency staff use the app: pg-boss does
  not replay ticks missed while asleep, and the first tick after waking finds every sheet overdue, so all connected
  sheets are checked at once, within S35's budget (S18's cursor makes the gap harmless). Google calls made by a
  check do not keep a sleeping Render service awake: only an incoming request does. The console takes no part
  (in the pilot it sleeps until platform staff use it).
- **S37. Backing off.** A 429 from Google ends the check without a fault: the connection's next request is held for
  Google's `Retry-After` (60 seconds when absent, doubling to 10 minutes while it keeps happening), and the schedule's claim skips that account's connections until then. A timeout, a 5xx or a network error is the same: retried at the
  next dispatch, "Last checked" keeps the last good time, and nothing is shown to the agency. A request has a 20-second
  timeout.
- **S38. Sync now** (`leadSheets.syncNow`) publishes `sheet.sync-requested` for one connection: a full read (S18) that
  also ends the wait of S29. It is refused with `SHEET_BUSY` ("Just checked. Try again in a few seconds.") within 30
  seconds of the last check or while one is running, and with the right sentence for a paused or attention sheet,
  except Lost access and Tab missing, for which the button reads **Check again** and tries at once. Its result comes
  back by polling the sheet's page every 2 seconds while a check is running.

### 4.7 When it goes wrong

- **S39. Lost access (owner).** Google answers 403 `PERMISSION_DENIED` or 404 when the share is removed or the sheet is
  deleted. The first such answer from a scheduled check only counts (`consecutive_failures`, so a blip doesn't alarm);
  the third in a row, or one from **Sync now** or **Check again**, sets `status = lost_access` with `attention_since`.
  The page says so with the fix (3.5), and the agency Owner gets **one** notice for the change into that state
  (S45). Checks continue at the normal pace so that sharing again fixes it by itself within fifteen minutes; each
  failure after the first doesn't notify. When a check succeeds the sheet is `running` again (an audit entry,
  no notice).
- **S40. Tab missing.** Google answers 400 "Unable to parse range" for a renamed tab. The check calls `describe` once,
  finds the tab by its `gid` (the title is only a cache) and carries on; a `gid` that is gone is `tab_missing`, handled
  as in S39 (notice once; the page asks for another tab).
- **S41. Pause and resume.** **Pause** stops the checks (no cursor change). **Resume** continues from the cursor, and
  rows added meanwhile are added then. Both are open while read-only (S44).
- **S42. Disconnect** (3.6): `status = disconnected`, the sheet's `sheet_row` ledger, columns and value matches are
  deleted in the same transaction; the connection row stays, with its counters, as the record of what the sheet did.
- **S43. Erased customers never come back (section 9).**
- **S44. The subscription decides, as it does for imports.** Each check resolves the connector's access afresh and
  honours ADR 0021's check 2 (B31): when the agency is read-only (suspended or lapsed), the check reads nothing,
  keeps its cursor and shows "Paused while your subscription is read-only"; when the subscription is active again the
  rows that waited are added. Pause and Disconnect are `lifecycle: "always"`: they only reduce what happens.
- **S45. One notice, not one per check.** A notice is sent only when a connection changes into an attention state
  (`lost_access`, `tab_missing`, `columns_missing`, `needs_manager`), with `sourceEventId` the id of the
  `sheet.attention` event that recorded the change, so a repeat adds nothing (`notify`'s own rule). The same state
  twice in a row notifies once; leaving the state and re-entering it notifies again.

## 5. Data

Every new table has `organization_id`; all but `sheet_check_schedule` and `sheet_spreadsheet_claim` (explicit exemptions, last in this list) are organization tables under row-level security (ADR 0028, bulk section 5): `organization_id` referring to `organization`
with `ON DELETE RESTRICT ON UPDATE RESTRICT`, `SELECT app_enable_org_rls('<table>');` in the migration that creates
it, UUID v7 ids, keys and unique constraints that include `organization_id`, CHECK lists for fixed values, and a
row-creating fixture in `packages/db/test/org-table-fixtures/sheets.ts`. None is soft-deleted; the runtime role updates
them all and deletes `sheet_row`, `sheet_column` and `sheet_value_match` rows. Ids of records in other modules are
plain uuids. No migration seeds anything; `deleteOrganizationRows` purges them with the rest.

- **sheet_connection** (sheets): `status` (connecting, running, paused, lost_access, tab_missing, columns_missing,
  needs_manager, disconnected); `spreadsheet_id`; `tab_gid`; `tab_title`; `sheet_title` (a cache, refreshed by the daily
  full read; may name a customer, so audit entries never hold it); `sheet_locale`; `sheet_time_zone`;
  `service_account_index`; `step` (share, tab, columns, existing, done) for the connect screens; `existing_rows`
  (only_new, check); `cursor_row`; `rows_seen`; `header_hash`; `connected_by`, `impersonated_by`; `rows_added`,
  `rows_merged`, `rows_duplicate`; `consecutive_failures`; `attention_since`; `last_checked_at`, `last_ok_at`,
  `last_full_read_at`; `check_started_at`; `hold_until` (S37); `created_at`, `connected_at`,
  `disconnected_at`. Unique `(organization_id, id)`; partial unique
  `(organization_id, spreadsheet_id, tab_gid)` where `status <> 'disconnected'` (S7); index
  `(organization_id, id DESC)` for the list.
- **sheet_column**: the connection, `header_key`, `header` (as read), `field` (null: don't import; a CHECK list of the
  lead import's fields). Unique `(organization_id, connection_id, header_key)`.
- **sheet_value_match**: the connection, `field` (owner), `value`, `target` (a user id), `matched_by` (chosen). Only
  hand-made matches are kept (S22). Unique `(organization_id, connection_id, field, value)`.
- **sheet_row**: the connection, `raw_hash` (bytea), `occurrence` (smallint), `row_number` (last seen, for the problem
  list), `status` (before_connect, pending, added, merged, duplicate, not_added, erased), `reasons` (text[] of codes),
  `fingerprint` (bytea, added, merged and duplicate rows), `lead_id`, `person_id`, `example_name` and `example_value`
  (at most 120 characters, problems only), `resolved_at`, `first_seen_at`, `processed_at`. Unique
  `(organization_id, connection_id, raw_hash, occurrence)` (S19); a partial index on `(organization_id, fingerprint)`
  where it is set (S23, read with `= ANY`); a partial index on `(organization_id, connection_id, row_number)` where
  `status = 'not_added' AND resolved_at IS NULL` for the problem list; one on `(organization_id, person_id)` for
  erasure. A sheet of 20,000 rows holds 20,000 small rows.
- **sheet_erased_contact**: `contact_hash` (bytea: HMAC-SHA256, keyed with `SHEETS_HASH_KEY`, of a normalised phone, email or Instagram handle, S43),
  `erased_at`. Unique `(organization_id, contact_hash)`.
- **import_batch** (the bulk release's) gains `source_sheet_id` (a sheet connection, nullable: the connect-time import)
  and `add_in_crm` (boolean, default false, the choice for the new group); `import_row.plan` gains `in_crm`;
  `lead.source` gains `google_sheet` (the source filter, the Leads list, the export and the audit words gain it).
- **Files:** the connect-time import's CSV is stored as an `import_batch` file (bulk section 5), under the bulk rules,
  and goes with the import's seven days.
- **sheet_spreadsheet_claim** (sheets; the second exempt table, S4): `id`, `organization_id`, `spreadsheet_hash`
  (bytea, unique across all agencies: the keyed hash, never the spreadsheet id), `created_at`. Ids and a hash only.
  It must be unique across organizations, which row-level security would hide, so it is exempt and reached only
  through `@travel-crm/db/sheet-schedule` (`spreadsheetClaims(tx)`) inside `db.withoutOrg`, by the same rules as
  the schedule below; the claim is taken and released inside `withoutOrg` transactions the sheets module opens
  around the connection's own.
- **sheet_check_schedule** (sheets; the one table of this feature **outside row-level security**, an explicit and
  reviewed exemption): `id` (the connection's own id, the primary key), `organization_id` (named as every
  organization table's is, restricting deletion like the others, so the keys test still covers it),
  `service_account_index`, `next_check_at`, `claimed_until`. Ids and times only: no personal data, no title, no
  link. An index on `(next_check_at)` for the claim. The worker has to find due sheets of every organization
  without entering one, so the table can't be under row-level security; therefore it can't be reachable from an
  organization transaction. How the guards treat it:
  - `packages/db/test/org-table-fixtures.ts` gains a second named list beside `signInTables`:
    `unscopedScheduleTables = ["sheet_check_schedule", "sheet_spreadsheet_claim"]`, with the comment "ids and times only, no organization
    data; reached only through @travel-crm/db/sheet-schedule inside db.withoutOrg()". `isolation.test.ts`'s
    `tablesWithOrganizationId` filters it out (so it needs no `app_enable_org_rls` and no row-creating fixture), exactly
    as it filters `signInTables`. Nothing else is exempted: `organization-keys.test.ts` still demands its foreign
    key to `organization` and its unique constraints with `organization_id`.
  - A new test, `packages/db/test/schedule-table.test.ts`, keeps the exemption honest: each listed table exists and
    has `organization_id`; it has no row-level security and no other table is exempted by this list; its columns
    are exactly those above (so nobody adds personal data to an exempt table); `OrgTx`, `IdentityTx` and the identity
    client don't expose `sheetCheckSchedule` (`@ts-expect-error`, as `unscoped-tables.test.ts` does for webhook events)
    and a cast past the types is refused at run time (`UnscopedModelError`); `app_runtime` holds select, insert,
    update and delete on it and nothing else.
  - It is reached only through `@travel-crm/db/sheet-schedule` (`sheetSchedule(tx)`, a third entry point beside
    `webhooks` and `rate-limits`) inside `db.withoutOrg(tx => ...)`; dependency-cruiser keeps the entry point to the
    sheets module's `schedule.ts`; the ESLint raw-SQL guard (`rawSqlSelectorsAllowing` in
    `packages/domain/eslint.config.js`) flags SQL naming the table anywhere else.
  - The db README's table of entry points and its paragraph on `withoutOrg` gain the row, and ADR 0031 records the
    exemption and why it is safe: the table holds no organization data, and the job that reads it enters the
    organization through `forOrg` for everything that does.
  - **If the guards can't take it** (the isolation test discovering tables by column name would otherwise demand a
    fixture and RLS): the plan must add the named list to that test as above, nothing more; no column is renamed.
  - It is **written after the connection's own transaction**, by a listener of `sheet.schedule-changed` (published in
    that transaction, so it is never lost and its upsert or delete is safe to run twice): a connection that is
    `running`, `lost_access`, `tab_missing`, `columns_missing` or `needs_manager` has a row; one that is
    `connecting`, `paused` or `disconnected` has none. A stale row is harmless: the check re-reads the connection
    under `forOrg` and does nothing, and removes the row, when the connection isn't due. The erasure and the purge
    delete an organization's rows from it with the rest.

## 6. Modules, the port, permissions and api

### 6.1 The Google adapter (`packages/integrations/src/google-sheets/`)

A port and two adapters (ADR 0008), the only code that imports `google-auth-library`:

- **Port `GoogleSheets`:**
  - `accounts(): readonly { index: number; email: string }[]` (the addresses to show);
  - `describe(accountIndex, spreadsheetId, { tabGid? }): Promise<SheetDescription>`: title, locale, time zone, the
    tabs (`gid`, title, grid or not, row count) and the first row and three rows of the chosen tab;
  - `readRows(accountIndex, spreadsheetId, { tabTitle, fromRow, maxRows, maxColumns, maxCellLength }): Promise<SheetRead>`:
    the header row and the rows from `fromRow`, as displayed text, with the last row number of the tab; one
    `batchGet`.
  - Failures are `GoogleSheetsError` with one `reason`: `not_shared`, `not_found`, `not_a_sheet`, `tab_missing`,
    `rate_limited` (with `retryAfterSeconds`), `unavailable`, `too_large`. Messages never hold a sheet's content or a
    token. There is **no method that writes** (S1).
- **Real adapter:** plain `fetch` (Node 24's) to the two Sheets v4 endpoints (`spreadsheets.get` with `fields`
  asking only for what `describe` needs, and `spreadsheets.values.batchGet` with
  `valueRenderOption=FORMATTED_VALUE`), with `google-auth-library`'s `JWT` client for the service account's token
  (it caches the token, refreshes it, and is maintained by Google; Apache-2.0; npm's latest on 19 Oct is 11.3.1,
  modified 15 Oct; pinned exactly, at least a day old, as pnpm's rule asks). Responses are parsed with Zod schemas. A
  20-second timeout per request. Not `googleapis`: it is a very large package (every Google API) for two endpoints, a
  supply chain for little. Not our own JWT signing with `node:crypto`: it would work for the service account, but the
  future "Sign in with Google" needs the OAuth client that `google-auth-library` already has. Not `@googleapis/sheets`:
  a generated client of the whole Sheets API for two calls.
- **In-memory adapter** for domain, api and journey tests: sheets as objects (title, tabs, rows) with methods to
  `share(accountEmail)`, `unshare`, `delete`, `append`, `insertAt`, `deleteAt`, `sort`, `editCell`, `rename`,
  `renameTab`, to make the next call fail with any reason (including `rate_limited` with a retry time) and to count
  calls. It enforces the sharing: an unshared sheet answers `not_shared`, as Google does.
- dependency-cruiser's `vendor-sdks-only-in-integrations` adds `google-auth-library`. `apps/api/test/bundle.test.ts`
  keeps it in the bundle.
- **Future "Sign in with Google":** a second implementation of the same port taking an OAuth credential in place of an
  account index (`drive.file` scope, Picker). `sheet_connection` would gain `credential_id`; checks, rows and
  screens stay. Nothing in this release builds it.

### 6.2 sheets (a new domain module, L0)

At L0 beside `imports` and `exports`, so crm (L1) may call it and it never calls crm or today
(`business-modules-call-down` gains it). It holds: the limits (`limits.ts`), the link, the spreadsheet claim (`sheet-link`,
`spreadsheet-claim`), connections and their steps, the columns, the baseline, the check engine that reads the sheet and decides
which rows are new (cursor, window, hashes, S17-S20, S29, S31), the ledger, the attention states and their notices,
the erasure step (`withdrawSheetRows`), and the sweep's steps. It calls identity below it (`firstOwner`,
`resolveAccess`, `matchLeadWorkers`) and imports (`headerKey`, `guessFields`, `rowFingerprint`,
`earlierFingerprints`).

- Contracts: `@travel-crm/contracts/sheets` (the link schema, the connection shapes, the problem rows, the steps); the
  `google_sheet` source in `@travel-crm/contracts/crm`.

### 6.3 crm

`lead-sheets/` (`sheet-rows.ts` reading a sheet row into an enquiry through `readLeadRow`, `check-lead-sheet.ts` the
listener, `sheet-leads.ts` the plan of S23 and the save, `sheet-notices.ts`): crm turns the rows the sheets module
found into leads. `saveEnquiry` gains the notify option (S32). The lead import's check gains the `in_crm` plan for an
import with `source_sheet_id` (S14, 3.3): after blocked and already imported, a row whose contacts match a person who
has any lead, open or closed, and `add_in_crm` is false.

### 6.4 identity, notifications, platform

- identity: nothing new beyond the bulk release's `matchLeadWorkers` and `firstOwner`.
- notifications: kinds `sheet.needs-attention` and `lead.sheet-added` (section 8).
- sheets also owns `schedule.ts` (S36, the one reader of `sheet_check_schedule`); platform: the sweep's steps (section 7).

### 6.5 Permissions and procedures

No new permission. **`leadSheets`** (the `crm` plan module), every procedure built from `procedures.ts`, inputs name
a sheet by id only (the link only in `begin`, through `sheetLink`):

- `begin`, `verify`, `chooseTab`, `match`, `chooseExisting`, `syncNow`, `recheck`, `hideProblem`: `orgProcedure.requires("leads:create",
  "leads:assign")`; `get`, `list` and `problems` the same, as views;
- `confirm`, `takeOver`, `resume`, `pause` and `disconnect`: `freshProcedure` with the same permissions (they decide
  where customers' data comes in); `pause`, `resume` and `disconnect` are `.meta({ lifecycle: "always" })`.

A sheet of another organization or one disconnected is `NOT_FOUND`; a step asked out of turn is
`CONFLICT`/`SHEET_NOT_READY`. New reasons, each with its sentence in `errors.json`: `SHEET_LINK_INVALID`,
`SHEET_NOT_SHARED`, `SHEET_NOT_GOOGLE_SHEET`, `SHEET_CLAIMED_ELSEWHERE`, `SHEET_EMPTY`, `SHEET_ALREADY_CONNECTED`,
`SHEET_LIMIT_REACHED`, `SHEETS_NOT_SET_UP`, `SHEET_NOT_READY`, `SHEET_BUSY`. Reasons of the bulk release are reused
(`IMPORT_NEEDS_NAME_AND_CONTACT`, `FIELD_MATCHED_TWICE`).

### 6.6 The web app

- `apps/web/src/lead-sources/` (the list, the connect steps, the sheet's page, the attention alerts) and routes
  `/settings/lead-sources`, `/settings/lead-sources/sheets/connect`, `/settings/lead-sources/sheets/[sheetId]` and
  `.../connect`. Addresses hold ids only.
- Reuses, by name: `ColumnMatcher`, `ValueMatcher`, `CopyButton`, `PageHeader`, `EmptyState`, `ErrorState`,
  `RefusalAlert`, `Details`, `ConfirmDialog`, `LoadingRows`, `useCursorPages` with `ShowMoreButton`, `useWriteAccess`,
  `WriteHint`, `formatDay`/`formatDateTime`, and the import's own pages for 3.3. `ColumnMatcher` gets a prop to hide a
  field (Stage).
- Polling: `useLeadSheet(id)` every 2 seconds while a check runs or the sheet is being read, else every 30 seconds
  while the page is open (it shows a new count without a reload).

## 7. Jobs and events

Each step is a listener on an event published in the step's own transaction (ADR 0009); payloads hold ids; every
listener does nothing for a connection no longer at its step.

- `sheet.baseline-requested` (`{ sheetId }`) → `sheets.baseline`: S14. Reads the whole tab, writes the ledger rows
  (`before_connect`, 1,000 to a transaction), sets the cursor and `connected_at`, moves the connection to `running`;
  with `existing_rows = check`, also writes the CSV and publishes `import.uploaded` for the import it creates.
- `sheet.check-due` (from the schedule's job) and `sheet.sync-requested` (`{ sheetId }`) → `crm.check-lead-sheet`: S17-S32, in this order: claim
  the connection (a transaction that sets `check_started_at`, and does nothing when a check started less than 5
  minutes ago, when the sheet is not `running` or an import is adding); read Google outside any transaction; then
  the 50-row transactions; then close the check (`last_checked_at`, `consecutive_failures`, the cursor, counters, the
  owners' summary notice). Idempotent: a re-dispatch finds the rows known.
- `sheet.attention` (`{ sheetId, state }`): the state change of S45; its listener sends the one notice.
- The listeners are added to `apps/api/src/worker-jobs.ts`; the Google adapter is built in `apps/api/src/services.ts`
  from `GOOGLE_SHEETS_SERVICE_ACCOUNTS`.
- **The worker's schedule:** `sheets.dispatch-checks` every minute (S36), queueing `sheets.check` (`{ sheetId,
  organizationId }`), whose handler enters the organization with `forOrg` and publishes `sheet.check-due` there, so
  the check is the listener `crm.check-lead-sheet` above, run once per event. `sheet.schedule-changed` (`{ sheetId }`)
  → `sheets.update-schedule`: the upsert or delete of the connection's schedule row.
- **The console's sweep** (`apps/api/src/console-jobs.ts`, hourly; not time-critical, so it may sleep) gains: drafts
  untouched 24 hours deleted (S6), resolved problems older than 7 days deleted, and schedule rows with no live
  connection deleted.
- Job data and errors hold ids and reason codes only, never a sheet's content or its title.

## 8. Audit and notifications

- **Audit** (`recordAudit` in the change's transaction; each action with its sentence in `audit.json`, record type
  `sheet_connection`):
  - `sheet.connected` (the connection id, the existing-rows choice and the number of columns matched, never the title
    or a header), `sheet.columns-changed`, `sheet.paused`, `sheet.resumed`, `sheet.taken-over`,
    `sheet.disconnected` (with the counters), `sheet.access-lost`, `sheet.access-restored`, `sheet.tab-missing`
    (the last three by the system actor of the organization), `sheet.problem-hidden`;
  - the leads a sheet makes are audited exactly as by hand (`person.added`, `person.edited`, `lead.added`,
    `lead.repeat-enquiry`, the destination added), the connector as the actor with source `job`, with the connection's
    id as the detail.
  Snapshots never hold a cell's value, a header, the sheet's title, or a link.
- **Notifications** (`notify()`, bell, push and email, opt-outs apply), each kind in `kinds.ts` with its words:
  - `sheet.needs-attention` to the agency Owner, once per change into an attention state (S45): "We can't open your
    sheet 'Goa Diwali campaign'. Share it with <address> again.", "The tab ... isn't there any more", "Columns are
    missing from ...", "<Name> can't manage lead sources any more", each linking to the sheet's page. The Owner is the
    one who gets it even when someone else connected the sheet; the connector is not told twice.
  - `lead.sheet-added` to an owner, only when a check made more than 5 leads or repeat enquiries for them: "12 new
    leads from 'Goa Diwali campaign' are now yours", linking to their Leads list filtered by source Google Sheet.
  - Up to 5, the existing "New lead assigned to you" and "Repeat enquiry on your lead" go out as for a lead by hand.

## 9. Erasure and purge

- **S43. An erased customer's rows never come back from a sheet.** The customer's row stays in the agency's own sheet,
  which we never change, so the erasure must outlive it. Erasing a customer (`eraseCustomerParts`) calls the sheets
  module's `withdrawSheetRows(tx, organizationId, personId, contacts, now)` in the erasure's platform transaction:
  1. the person's `sheet_row` rows (by `person_id`) keep their `raw_hash` and `fingerprint`, **rewritten as an
     HMAC-SHA256 keyed with `SHEETS_HASH_KEY`** (section 14: an environment setting, never stored in the database), so a hash that could be tested against guessed phone numbers
     becomes one that can't; their `lead_id`, `person_id`, `example_name` and `example_value` are emptied; their
     status becomes `erased`. A known row stays known (S19: the lookup tries the plain hash and the keyed one), so
     the same row, whenever it is read again, is skipped.
  2. each of the person's contacts (phone, email, Instagram handle) is **normalised** (E.164, lower-case email, handle
     without "@", as B14 reads them), hashed and written to `sheet_erased_contact` as an HMAC-SHA256 and nothing
     else: no plaintext of the contact is kept anywhere, and the person's own rows lose theirs as above. A different
     row of the same person (another form fill from before the erasure, not yet read) is then left out as "A
     customer who asked to be erased" (S23). The tombstone has no expiry, because "never come back" is the
     rule; a person who really wants to enquire again asks the agency, who can have platform support remove it.
  3. every `sheet_row`'s `example_name` and `example_value` in the organization are emptied (a problem row can't be
     tied to one person), as the bulk spec empties every import's examples (section 9 there).
  The erasure's confirmation tells the agency to also delete the person's rows from its own sheet.
- **Erasing a removed member** empties nothing here; `connected_by` becomes `needs_manager` handling (S34).
- **The connect-time import's** file and report are withdrawn by the bulk release's own steps.
- **Purge:** the new tables are purged with the rest (`deleteOrganizationRows` reads the catalog). A connection's
  stored data (columns, values, ledger) goes with the organization; Google keeps nothing of ours, and the agency
  removes our address from its sheet.
- **The erasure checklist** (`packages/domain/src/platform/erasure.ts`) gains the step, and its test gains a sheet row
  and a contact for the person, and a second row of theirs read after the erasure.

## 10. The demo

The demo organization has no Google configured, so **Connect a sheet** is off with the hint "Not available in the demo",
and no connection is seeded (it would read Google every fifteen minutes for a night's life). `resetDemoOrganization`'s
sample leads gain two with source Google Sheet and the detail "Goa Diwali campaign · Form responses 1", so the source
shows in the list and on a lead.

## 11. Performance (ADR 0028)

In the performance tests' own database, with the in-memory Google, the seeded large agency (50,000 leads) and 100
connections:

- **A check with nothing new:** one Google call, one claim, one read of the window's hashes (`= ANY` on the unique
  index, 100 hashes), one update: within 150 ms of our own time, and no row written. 100 such checks within 10
  seconds with the queue's concurrency of 4.
- **A check with 50 new rows:** the lookups once per kind for the batch (contacts, open leads, blocked contacts,
  fingerprints in `import_row` and `sheet_row`, tombstones), the saves, and the ledger within 2 seconds, checked with
  `EXPLAIN` as `app_runtime` inside `forOrg` (a plan read as another role proves nothing).
- **Connect of a sheet of 20,000 rows:** the full read within 5 seconds of our own time (the response is held as
  ~20 MB at the limits), the baseline within 30 seconds at 1,000 rows to a transaction, the worker's memory under 150
  MB.
- **The daily full read** of 20,000 known rows: within 10 seconds, in chunks of 1,000 hashes.
- **The dispatcher** over 1,000 connections: one indexed query on `(status, last_checked_at)`, within 100 ms, and not
  more than `maxReadsPerMinutePerAccount` requests per account per minute (a test counts the adapter's calls).
- The sheet's page (counts from the connection's counters, 50 problems from the partial index) within 150 ms.

## 12. Journeys and tests

**Journeys** on phone and desktop, with axe after each, against the in-memory Google (the harness gives a `fakeGoogle`
the journeys script):

1. An Owner connects a sheet: shares with the shown address, pastes the link, matches columns, chooses
   "Only new rows from now on"; the existing rows are not added; the form adds a row (the fake appends it); within
   one check the lead shows with source Google Sheet, its owner and its notice.
2. Connect with "Also check the rows already there": the preview shows Already in your CRM with the open and closed
   counts, left out; tick one with a closed lead; add; that person gets a Returning lead; the rest of the sheet's
   rows are not added by the sync afterwards.
3. No duplicates: a person with an open lead (typed by hand) fills the form: a repeat enquiry on that lead, not a
   second lead. The same row in a second connected sheet, and in a file import, is left out as a duplicate. A person
   whose leads are all closed fills the form: a new lead marked Returning.
4. Sort the sheet, insert a row in the middle, delete a row: Sync now adds only the inserted one, nothing is added
   twice, nothing is lost.
5. A row with no contact is listed under Couldn't be added with its reason; the fake edits the cell to a phone; the
   next check adds the lead and the line clears. Hide removes another.
6. Unshare the sheet: after three failed checks the page says Lost access with the address, the Owner has exactly
   one notice however many checks fail; share again, Check again, running, rows that arrived meanwhile are added.
7. Sync now, twice in a row: the second is refused with its sentence; Pause and Resume; Disconnect; connecting
   again asks about the rows again and adds nothing twice.
8. The sixth sheet is refused with its sentence; a second connection to the same tab is refused; a link to an Excel
   file is refused; a sheet already connected to another agency is refused with the generic sentence, which names nothing of the other agency; disconnecting it there frees it here.
9. Erase a customer: their row is read again by a full read and is not added; a different row naming their phone is
   left out during the hold.
10. A read-only agency: the sheets are paused with their sentence, Sync now is off, Pause and Disconnect still work.

**Tests the builders write first** (besides each rule's own): the port has no write method (S1); the link schema
(accepted and refused links, the id only); the spreadsheet claim (taken, own second tab, lost race, release on disconnect, the sentence naming nothing); the
adapter's mapping of Google's answers to reasons (a recorded 403, 404, 400, 429 with `Retry-After`, 5xx); the cursor,
window and full-read decisions; row hashes and occurrences under sort, insert, delete and edit; the order of S23 case
by case; the plan of two rows of one check; resuming after a crash and two overlapping checks adding each row once;
the check refusing while an import adds, and the reverse; the attention notices sent once; the dispatcher's
budget per account and its skipping of a held account; the erasure step and the keyed hashes; the organization
fixtures; the query plans of section 11; and the in-memory Google refusing an unshared sheet.

**Visual audit** of every new screen (`docs/ui-build-loop.md`) until no "must" is left.

## 13. Build order

One branch, `sheets/sync`, after the bulk release's shared pieces and lead import have merged, because it reuses their
`ColumnMatcher`, `readLeadRow`, `saveEnquiry`, `rowFingerprint` and the import pipeline. Inside it:

1. **Port and adapters** (6.1), the configuration, the dependency rule and ADR 0031 (Google Sheets sync: a service
   account, read only, polling, the spreadsheet claim and the exempt tables). It needs nothing from bulk and may start first.
2. **Tables, the sheets module, contracts** (sections 5 and 6.2): connect, steps, baseline, the engine.
3. **crm's side:** the check, the plan of S23, the notify option, the `in_crm` plan and `google_sheet` source.
4. **The worker's dispatcher, the schedule table with its module, and the sweep** (S36, section 7).
5. **The screens** (section 3) and their words, then the journeys.

**Changes to the bulk release's pieces,** each small and made in this branch: `import_batch.source_sheet_id` and
`add_in_crm`, `RowPlan` `in_crm`, the preview's new group and its tick (3.3), `guessFields`' `wordsInHeader` option,
`ColumnMatcher`'s hidden-field prop, `saveEnquiry`'s `notify`, `readLeadRow`'s moment-with-time reading for
Enquiry date, the `lead.source` value, and `earlierFingerprints` staying unchanged (crm unions it with the sheets'
own query, S23, so `imports` never calls `sheets`).

## 14. What the owner has to do

Before the first agency connects a sheet:

1. **Create a Google Cloud project** (console.cloud.google.com), for example "travel-crm-sheets". Use a company Google
   account, not a personal one: the project and its keys belong to the business.
2. **Enable the Google Sheets API** in that project (APIs and Services, Library, "Google Sheets API", Enable). The
   Drive API is not needed.
3. **Create a service account** (IAM and Admin, Service Accounts, Create), no roles, no users. Its email, such as
   `crm-sheets@<project-id>.iam.gserviceaccount.com`, is the address agencies share their sheets with, so choose its
   name with that in mind: agencies will read it.
4. **Create a key** for it (Keys, Add key, JSON) and download the file once. Google can't show it again. It is a
   secret like the database password.
5. **Put the key in the deploy's settings** (`docs/deploy-checklist.md` gets this row in its settings table and its
   notes: the api and the worker, never the console):
   - `GOOGLE_SHEETS_SERVICE_ACCOUNTS`: one variable holding the key file's JSON, or a JSON list of several, either
     base64 encoded (`base64 -i key.json`, one line, easy to paste) or as single-line JSON. Absent, Google Sheets is
     off and the page says so. Decoded and validated at start-up (`apps/api/src/environment.ts`): valid base64 or
     JSON, each with a `client_email` and a `private_key`; a bad value stops the process with a message that names
     the variable and never prints it. The worker runs inside the `travel-crm-api` service on Render, so this one
     setting reaches the api and the worker together; the console never gets it.
     The same row goes in `docs/deploy-checklist.md`'s settings table (process: api and worker; secret: yes).
   - **On Render:** open `travel-crm-api`, Environment, add the variable as a secret, paste the base64 text, save and let
     the service redeploy; check its log for the start-up line that says how many service accounts were read.
   - `SHEETS_HASH_KEY`: at least 32 random characters (`openssl rand -base64 32`), required when the service
     accounts are set, api and worker. It keys the spreadsheet claim (S4) and the erasure tombstones (S43). It lives in the
     environment only, never in the database or a log, and is not rotated: changing it makes old tombstones stop
     matching, so keep it with the secrets that are never changed.
6. **The worker may sleep** (S36): it wakes when staff use the app, and its first tick checks every sheet. A sheet is
   therefore as fresh as the worker is awake; Sync now checks at once. Keeping the worker awake all day (a paid plan or
   an uptime pinger) makes it the promised 15 minutes. The console plays no part in checking sheets.
7. **Add a second service account** when a single one has about 400 connected sheets: repeat steps 3-4 and add its key
   to the list. Nothing else changes; existing sheets stay with their first address. Google's limits to watch
   (Cloud console, Quotas): 300 reads a minute for the project and 60 a minute per service account.
8. **Before real agencies** (not for the pilot): Google may ask the project to be verified only if we later add OAuth
   ("Sign in with Google"). A service account needs no verification.
9. **Tell agencies in the help text** that the address in the connect screen is ours, read only, and that removing it
   from the sheet's sharing stops the sync at once.

## 15. Decisions I made

The owner settled ten (one way only; sharing with our address; deleted, sorted or inserted rows change nothing; no
duplicates; the existing-rows question; stage and owner; 5 sheets; 2-minute checks and Sync now; rows that can't be
added listed; lost access noticed once; managers connect). These calls are mine, each open to change:

1. **No proof step: share and paste only, with one quiet safeguard (owner, 2026-10-19):** a spreadsheet can belong to
   one agency at a time, by a keyed hash of its id (S4), and a second agency gets a generic refusal. The owner
   accepts the remaining risk: a leaked link lets its holder connect the sheet first, since one service account reads
   every sheet shared with it.
2. **The worker dispatches the checks from a small schedule table outside row-level security (S36):** the console sleeps
   in the pilot, so it can't; the table holds ids and times only and is reached through its own module, as webhook
   events are.
3. **Plain `fetch` with `google-auth-library`, not `googleapis` (6.1):** two endpoints need no giant package, and the
   OAuth client is there for "Sign in with Google" later.
4. **Rows already in the sheet become an ordinary import (3.3):** the preview, matching, report and fingerprints
   are the bulk release's own; the only addition is the Already in your CRM group.
5. **Connecting always records a baseline of the existing rows (S14):** "Only new rows" and the unticked rows of the
   preview can never come back, even after a sort.
6. **A cursor with a 100-row lookback, a daily full read, and Sync now as a full read (S18):** a form appends, so the
   usual check reads a few dozen rows; a sort or an insert is caught within a day or at once by the button.
7. **Rows are known by a hash of their cells, and duplicates by the import's fingerprint (S19, S23):** the first
   survives any re-ordering; the second works across sheets and imports.
8. **A new row is New with the Owner column's or agency Owner's lead, no Stage field (S22):** your rule; old stages
   come with a file import or the connect-time preview's default.
9. **A finished row is added at once; an unfinished one waits one check (S29):** the first reply clock matters more
   than a row someone is typing.
10. **An edited row is read as a new row (S28), owner confirmed:** following edits is out of scope; the cost is a repeat enquiry on
    an open lead, never a second lead.
11. **The sheet acts as the member who connected it, with Take over (S10, S34):** the same rule as an import, with a
    way out when they leave.
12. **Up to 5 owner notices go out as usual, more become one summary (S32):** a form's trickle should notify; an
    outage's pile should not.
13. **The Owner is told once for lost access and for the other states that stop rows (S45):** you asked for lost
    access; tab, columns and manager changes stop rows in the same way.
14. **Counts are counters, problems clear themselves, Hide dismisses (S30, S31):** the page is cheap and doesn't
    grow a list nobody can fix.
15. **Disconnect deletes the rows' record and keeps the counters (S42):** connecting again asks again, and no old hash
    can leave a sheet half-read.
16. **Erasure keeps only keyed hashes, of the erased person's rows and contacts, with no expiry (S43):** a row in a
    sheet we don't own can't be deleted, so the memory of it must outlast the erasure, in a form that can't be
    guessed back.
17. **Read the tab the link names, else the first (S3, 3.2):** pasting a tab's link is the natural way to pick it.
18. **At most 20,000 rows read, 10,000 offered to the connect-time import (S15):** a sheet is a working document; past
    that, a tab should be archived.
19. **Service account per connection, kept for life (S35):** the agency shared with that address.
20. **Pilot: no sheet in the demo (section 10):** it would read Google every fifteen minutes for a night's life.
