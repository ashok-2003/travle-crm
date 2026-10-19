# Release 2: bulk in and out

- **Status:** draft for the owner, 2026-10-19. The owner set the content and four decisions in conversation the same
  day (the owner's words: "important are giving the bulk import and export feature.. for lead and employees.. for the
  main main functionalities"). The screens and the calls in section 15 are for the owner to approve.
- **Date:** 2026-10-19
- **Scope:** Phase 1, build step 2, second release: lead import, lead export, staff import and staff export. Google
  Sheets both ways follows as its own release and spec (section 14).
- **Input:** the Phase 1 product scope (`2026-10-16-phase-1-product-scope.md`, sections 2 and 3.1), the release 1 spec
  (`2026-10-16-release-1-leads-by-hand-design.md`), ADR 0028 (data rules), `CLAUDE.md`, `DESIGN.md`. Where this
  document and the release 1 spec differ about imported leads, this one is newer.
- **Mockup:** `2026-10-19-bulk-in-and-out-screens.html`, beside this file. Where it and this text differ, this text
  wins.

## 1. Why this release, and what comes after

Release 1 gave agencies a place to work leads. Most of them already keep hundreds or thousands of enquiries in an
Excel sheet or a notebook typed into one, and their team in a list. Until those can come in at once, the product is a
second notebook. This release brings them in, and lets them take their data out again whenever they want.

It ships as four features, each on its own branch and merged to `main` when its gate is green, after one branch of
shared pieces (section 13):

1. **Lead import:** upload a CSV or Excel (.xlsx) file, match its columns to lead fields once, preview, then add.
2. **Lead export:** download the Leads list, with the person's current filters, as Excel or CSV.
3. **Staff import and export:** add many staff at once, each with a temporary password on a one-time sheet; download
   the staff list.
4. **Google Sheets both ways**, later, reusing lead import's matching (section 14).

**Goals**

- An agency moves its whole lead sheet in within ten minutes, and no row is lost without a reason it can read.
- Every imported row follows the same rules as a lead added by hand: one person per phone, repeat enquiries,
  Returning, blocked contacts, owners.
- An Owner adds a 20-person team in one go and hands each person a password.
- Anyone who can see leads takes exactly what they see away as a file, and every such file is in the audit log.

**Non-goals (later)**

- Google Sheets, the website form, the link for other tools: their own releases.
- Undoing an import (leads can't be deleted in release 1), merging people, importing notes as separate timeline
  entries, importing follow-ups or tasks, importing quotes or bookings.
- Exporting notes, the timeline, repeat enquiries or files.

**Anti-goals:** a parser in the browser; a password the server could show again; a file of customers' phones that
lives for weeks; an import that floods every phone with notifications; an export that runs the container out of
memory.

## 2. Who uses it

- **Lead import:** whoever holds both `leads:create` and `leads:assign` (the Owner, the Admin starter role, and any
  role an agency gives both). An import decides owners for leads that may not be the importer's.
- **Lead export:** anyone with `leads:view`, of exactly what their scope shows them (owner decision): a salesperson
  their own leads, a manager their own or everyone's.
- **Staff import and staff export:** whoever holds `staff:manage`.

## 3. The screens

Built from the registry components and the shared pieces (`CLAUDE.md`), mobile first, each with its loading, empty,
error-with-retry and refusal states. A change's button asks `useWriteAccess("change")`; the exports and the downloads
ask `useWriteAccess("export")` (ADR 0021), so a read-only agency can still take its data away.

### 3.1 Leads and Staff gain Import and Export

- **Leads:** the header keeps **+ New lead** (primary) and adds **Import** (outline, for those who may import) and
  **Export** (outline, for everyone who sees the list). On a 390px phone the three pills fit one row.
- **Staff:** the header keeps **Add staff** (primary) and adds **Import** and **Export** (outline).

### 3.2 The import flow (leads and staff alike)

One address per import (`/leads/import/<importId>`, `/staff/import/<importId>`): leaving and coming back finds it at
the same step. A caption under the title says the step: "Step 2 of 4 · Match columns".

1. **Choose a file** (`/leads/import`, `/staff/import`). `PageHeader` "Import leads", a sentence on what happens
   ("Each row goes through the same checks as a lead you add by hand. Nothing is added until you press Add."), the
   file button with "Excel (.xlsx) or CSV, up to 10,000 rows and 10 MB. We read the first sheet; its first row must
   name the columns.", a **Download a sample file** link (a static file with the right headers and three example rows),
   and **Recent imports**: the last ten, each with its file name, day, counts and status badge (Waiting for you in
   amber; Adding and Stopped in neutral; Done in green; Failed and Can't read in red), linking to its page.
   While the file goes to storage, its progress shows with **Stop**, and a failed upload has **Try again** without
   choosing the file again (as `UploadControl`). Then "Reading enquiries-oct-2026.xlsx…" for the second or two the
   worker takes.
2. **Match columns.** Each column of the file: its name, up to three sample values, and a `Select` of what it holds
   ("Don't import" first). The guesses are filled in (rule B9); a guess from the agency's last import says "As last
   time". Under the list, a short checklist of what is needed (Name ✓, a phone, email or Instagram ✓) and the
   questions a file can leave open: "Rows with no stage get: New ▾", "Rows whose owner isn't on your staff: Asha Sharma
   (Owner) ▾", and, when a budget column has no basis column, "Budgets in this file are: per person / for everyone".
   A column matched to **Owner**, **Stage** or **Role** lists its values with their row counts, each with its own
   `Select` and the automatic match filled in (B11). On a phone the columns are an `ItemGroup` (name, samples, then
   the select at full width); on a computer a `Table` (Column in your file · Sample values · Import as). **Check the
   rows** (primary) at the end.
3. **Check.** "Checking 1,286 rows…" with a `Progress`, then the preview: what will happen to every row, in groups
   with their counts (mono, right-aligned):
   - **Will be added:** new leads (and how many of them are returning customers), repeat enquiries on open leads, and
     "added with a value kept in the note" (B21);
   - **Your choice:** blocked contacts and rows already imported, each left out unless its `Checkbox` is ticked;
   - **Won't be added:** one line per reason with its count, opening (a `Collapsible`) to the first five rows as
     "Row 14 · Rahul Sharma · no phone, email or Instagram";
   - **New destinations** the import adds to the agency's list, by name;
   - a quiet line when many leads will be New: "612 leads will be New: each shows on its owner's Today as waiting
     for a reply. Change 'Rows with no stage' if your team has already spoken to them."
   Then **Add 1,157 rows** (primary), **Change the columns** (outline, back to step 2) and **Cancel this import**
   (link). Add asks once (`ConfirmDialog`): "Add 1,094 leads and 63 repeat enquiries? Imported leads can't be removed
   in bulk later." A sentence beside the rows not added says the importer may also fix them in the file now and upload
   it again.
4. **Add.** "Adding leads from enquiries-oct-2026.xlsx", a `Progress` with "642 of 1,157 rows" and "About a minute
   left", "You can leave this screen: we'll tell you when it's done", and **Stop** (outline, a `ConfirmDialog`: "Stop
   the import? The rows already added stay."). Then **Done**: a green "Done" badge, the counts as `Details` (new
   leads, repeat enquiries, rows not added), **Download the 129 rows not added** (primary, in the uploaded format) with
   "The file has your columns as they were, and a first column saying why each row wasn't added. Fix them and import
   the file again: rows already added are left out." and "Kept until 26 Oct", and **See the imported leads** (outline,
   the Leads list filtered by source Import).

An import that can't read its file says why in a sentence and offers **Choose another file** (B5). An import that
failed or was stopped shows what it added, the same download, and the reason.

### 3.3 Lead export

**Export** opens a `ResponsiveDialog` (a bottom sheet on phones), "Export leads":

- what it will hold, as `Details`: whose (Mine or Everyone), the stage, the filters and the search, all as the list
  shows them ("Everyone · Open · Goa · matching 'Sharma'");
- the format: **Excel (.xlsx)**, "Opens in Excel and Google Sheets" (chosen), or **CSV**, "For other tools", as the
  registry's radio choice cards;
- a sentence: "The file holds customers' phone numbers and emails. Your export is recorded in the audit log, and the
  file is deleted after 24 hours.";
- **Prepare the file** (primary). Then "Preparing 312 leads…" with a `Progress`, and the dialog may close
  ("we'll tell you when it's ready"); then the file's name and size with **Download** (primary).

The bell's "Your leads export is ready" opens `/leads/exports/<exportId>`: `PageHeader` "Leads export", what it holds,
its state, and **Download** until it is deleted.

### 3.4 Staff import

The same four steps (section 3.2), with these differences:

- The fields are Name, Username, Email, Phone and Role (B43). With no Role column, step 2 asks "Give everyone the
  role: Sales ▾". A Role column's values are matched to the agency's roles one by one.
- The preview adds the seats: "Adds 12 people: your plan has 14 seats free." Over the limit, **Add** is off and says
  why, in place of the button's hint: "This file adds 16 people, and your plan has 14 seats free. Leave some rows
  out, or ask us about more seats." (with the brand's support contact).
- The preview lists every row not added (a staff file is short), and "Already on your staff" separately.
- Add asks once: "Add 12 people? Each gets a temporary password, shown once on the next screen." Its button stays
  busy while the passwords are prepared and the job runs (seconds).
- **Done** shows the passwords once: an `Alert` ("Download these now. They can't be shown again: we never keep
  them."), **Download the passwords (.csv)** (primary), and the people as a list (a `Table` on a computer): name,
  username, temporary password with `CopyButton`. Under it: "Each person chooses their own password when they first
  sign in, with the organization code SHARMA." Once downloaded, the button reads "Downloaded" with a check.
- Coming back without the passwords (another tab, a reload): "These passwords were shown once." and **Make new
  passwords for the 9 people who haven't signed in yet** (B50).

### 3.5 Staff export

**Export** on Staff opens the same dialog as the leads' (section 3.3), without filters: "18 people, with their roles
and joined dates", the format, **Prepare the file**, then **Download**.

## 4. How it behaves

### 4.1 Files and reading (both imports)

- **B1. The worker reads every file; the browser never parses one.** The browser sends the file straight to storage
  (a presigned upload, as attachments do); the api records it and publishes `import.uploaded`; the worker reads it
  through the spreadsheets port (section 6.1). One reader serves the preview and the import, so they can't disagree.
- **B2. What a file may be:** `.xlsx` or `.csv`, at most 10 MB; at most 10,000 data rows for leads and 500 for staff;
  at most 50 columns; a cell at most 4,000 characters. The web picks the content type from the extension (Windows
  reports a CSV as `application/vnd.ms-excel`). `.xls`, `.numbers` and password-protected files are refused with what
  to do: "Save it as an Excel Workbook (.xlsx) or CSV and choose it again."
- **B3. What is read:** the first sheet of a workbook (the step names it: "Sheet 'Leads Oct', the first of 3"),
  hidden rows included; cell values as stored, a formula's last value and never the formula; dates as dates; the
  first row as the column names (a blank one is named by its letter, "Column C"; a repeated one gets "(2)"); empty
  rows skipped; a merged cell's value in its first cell. A CSV is read as UTF-8 (with or without a byte-order mark),
  UTF-16 with a mark, or else Windows-1252; its delimiter (comma, semicolon or tab) is found from the first row. One
  leading apostrophe is dropped from a cell, so a file this product exported imports back (B40).
- **B4. Reading is bounded:** the adapter inflates at most 50 MB from a workbook, stops one row past the limit, and
  never runs anything in a cell. A test feeds it a zip bomb, a sheet of a million rows and a cell of 10 MB.
- **B5. A file that can't be read** ends its import as unreadable with one reason: not a spreadsheet, protected, an
  old `.xls`, no column names, no rows, too many rows, too many columns, too large unpacked. Each has its sentence.
- **B6. Same file again:** the reader keeps the file's SHA-256. When an earlier import of the agency had the same
  file and added rows, step 2 says so: "You imported this file on 12 Oct (1,094 leads added). Rows already added will
  be left out." (B33 makes that true.)
- **B7. The file counts toward the plan's storage** while it is kept (B53), as any upload does; a full storage refuses
  the upload with the files module's own sentence.

### 4.2 Matching columns and values

- **B8. Fields.** A lead import's fields: Name; Phone; Email; Instagram; Destination; Travel from; Travel to; Travel
  month; Adults; Children's ages; Number of children; Budget; Budget basis; Departure city; Trip type; Hotel category;
  Food; Room type; Stage; Owner; Enquiry date; Their source; Note. Needed: Name, and at least one of Phone, Email and
  Instagram. Several columns may go to Note; any other field takes one column at most (a second one is refused:
  "Phone is already matched to 'Mobile No'").
- **B9. Guesses**, in order: the agency's last confirmed match for a column of the same name (kept per organization
  and kind, by the name lower-cased with spaces and punctuation squeezed), then the common names (Name: name, customer
  name, client, guest, traveller, naam; Phone: phone, mobile, mobile no, contact, whatsapp; Email: email, email id,
  mail id; Destination: destination, place, package, tour; Travel from: travel date, start date, date of travel;
  Adults: adults, pax, persons; Budget: budget, amount; Stage: stage, status, lead status; Owner: owner, assigned to,
  agent, executive, handled by; Enquiry date: date, lead date, enquiry date, created on; Their source: source, lead
  source, channel; Note: remarks, notes, comments, requirement; and the rest by their own names), then nothing. Our own
  report's "Why it wasn't added" and "Row" columns are always "Don't import".
- **B10. Confirmed matches are remembered** when the importer presses Check the rows: next month's file from the same
  sheet is matched in one tap.
- **B11. Values of Owner, Stage and Role.** The reader keeps, for each column with at most 50 different values, those
  values and their counts. Matched to:
  - **Owner:** each value goes to the lead worker (R14) whose full name, username or email it equals (case and spaces
    ignored), or whose first name alone it equals when only one lead worker has that first name; otherwise to the
    agency's Owner (owner decision), whom the importer may change, value by value, to any lead worker.
  - **Stage:** the stages' own words and keys, then common words (Booked, Confirmed, Converted → Won; Not interested,
    Dropped, Cancelled → Lost; Called, Follow up, In progress → Contacted; Quoted → Quote sent; Junk, Spam, Fake → Not
    a lead); anything else to the file's default stage, which the importer may change value by value.
  - **Role:** the agency's roles by name or key; anything else unmatched until the importer picks a role (rows still
    unmatched are not added).

  A column with more than 50 values is matched the same way at the check, value by value, without the list.
- **B12. Defaults for empty cells:** rows with no stage get the file's default stage (New unless the importer picks
  another open stage, Won or Lost); rows with no owner, or an owner value left to the default, get the agency's Owner
  (identity's `firstOwner`), or the lead worker the importer picks for them.
- **B13. Changing the match** (columns or values) runs the check again; the blocked and already-imported choices
  (B30) don't need it.

### 4.3 A lead row

Every row goes through crm's one save path for a new enquiry, the one the new-lead form uses (section 6.3), with the
importer as the actor.

- **B14. The person:** the Name cell (trimmed, 1-120 characters, any script) and the contacts: a phone read with the
  form's own `toE164` (India by default: "98765 43210", "09876543210", "919876543210", "+91-98765-43210" and an Excel
  number all become +919876543210), an email lower-cased, an Instagram handle without "@". The person is found by
  phone, else email, else handle (R4); a found person keeps their stored name and gains the contacts they lack, never
  one another person holds (R32).
- **B15. Open lead, Returning, new:** a person with an open lead gets the row as a **repeat enquiry** on it (the trip,
  the source and the note as asked; owner decision, with no question per row). A known person with no open lead gets
  a new lead marked **Returning**. Anyone else gets a new person and a new lead. A later row of the same file for the
  same person meets the lead an earlier row made, so it becomes a repeat enquiry too; a row identical to an earlier one
  is "Same as row 12" (B33).
- **B16. Blocked contacts:** a row any of whose contacts is on the blocked list is warned about in the preview and
  left out, unless the importer ticks "Add them anyway" for the file.
- **B17. Stage:** the matched stage, or the default (B12). Not a lead is never imported into: such a row is not added
  ("Marked Not a lead"). A row on an open lead ignores its stage (a repeat enquiry has none). A lead imported as Won or
  Lost reopens to New. A lead imported past New has no first-reply time: unknown, as later reports must show it.
- **B18. Owner:** from the Owner value's match, or the default (B12). Release 1's per-lead "New lead assigned to you"
  and "Repeat enquiry on your lead" are not sent for imported rows; each owner gets one notice per import instead
  (section 8).
- **B19. Source:** `bulk_upload` ("Import"), with the file's name as the source detail; a Their source cell follows
  it ("enquiries-oct-2026.xlsx · Instagram"), cut to 120 characters.
- **B20. The trip:**
  - **Destination:** found among the agency's destinations by name, case ignored, or added to them (as the form does);
    the preview names the new ones.
  - **When:** Travel from and Travel to as dates (a date cell, or dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, "16 Oct 2026";
    never month first); Travel month as "Dec 2026", "December 2026", "12/2026" or "2026-12"; "flexible", "open" or
    "not fixed" as flexible; nothing as not known. Only Travel from gives a one-day trip.
  - **Adults** 1-99; **Children's ages** as a list ("7, 4"); a **Number of children** without ages goes to the note
    ("Children: 2, ages not given"), since a lead keeps each child's age; with ages, the two must agree.
  - **Budget** in rupees: digits with commas, "₹", "Rs" or "INR", up to two decimals, and "k", "L", "lakh", "lac",
    "Cr" or "crore" ("1.5 lakh" is ₹1,50,000); the basis from a Budget basis cell or the file's answer (section 3.2).
  - **Trip type, hotel category, food:** the fixed lists' words, case ignored ("Honeymoon", "4 star", "Jain").
  - **Departure city, room type:** text up to 120 characters.
- **B21. A value we can't read keeps its row.** A date, month, number, budget, trip type, hotel category, food or
  stage word we can't read, a phone that isn't one when the row has another contact, or an email that isn't one when
  it has another contact: the row is added, and the value goes into the lead's first note as "Travel date: next
  winter". The preview counts these rows ("added with a value kept in the note").
- **B22. Note:** the Note columns, each as "Remarks: wants a houseboat", joined by line breaks, with B20's and B21's
  kept values, become the lead's first timeline note (or the repeat enquiry's note), at most 4,000 characters (past
  that the row is not added: "Notes over 4,000 characters").
- **B23. Enquiry date:** a date, not in the future, becomes the lead's added date, so "waiting for a reply since" is
  honest; the timeline still shows the import at its own time. Without one, the lead is added now.
- **B24. A row is not added only for:** no name; no phone, email or Instagram we can use; Marked Not a lead; notes over
  4,000 characters; the same as an earlier row of the file (B33); a blocked contact or a row already imported, which
  the importer left out (B16, B33). Each has its sentence in the report (B34).

### 4.4 Checking and adding

- **B25. The check is a dry run** over every row: the same reading as the add, with each contact, open lead, blocked
  contact and earlier fingerprint looked up in one query per kind for the whole file. It writes each row's plan (new,
  returning, repeat enquiry, blocked, already imported, not added) and reasons, and the new destinations. It changes no
  lead. The preview is a forecast: the add applies the rules again, row by row, to the database as it is then.
- **B26. Add runs as a job** (section 7), 50 rows to a transaction. Each transaction first holds the import's row (so
  two runs of the same job take turns), looks up its 50 rows' contacts, open leads and blocked contacts at once, then
  saves each row through the one save path, writes the row's outcome (added, merged into an open lead, left out, not
  added) with its lead and person ids, and moves the progress. A transaction that meets a unique violation (someone
  added the same contact meanwhile) runs again once, as the form's save does (R23).
- **B27. Resumes, never repeats:** a row with an outcome is never saved again, so a retried or re-dispatched job
  carries on where the last one stopped.
- **B28. Stop** marks the import; the job finishes the transaction under way and ends as stopped. Rows already added
  stay; the rest are in the report as "Stopped before this row".
- **B29. One import adds at a time in an agency:** Add is refused while another of its imports is adding ("Another
  import is adding leads. Try again when it's done."). Two imports of overlapping people would otherwise turn each
  other's new leads into repeat enquiries.
- **B30. The importer's choices** for the file (blocked contacts, already imported rows, the defaults and the value
  matches) are kept on the import and read by the add.
- **B31. The importer must still be allowed** when the job runs: it resolves their access afresh, and stops the import
  as failed when they are no longer a member, have lost `leads:create` or `leads:assign`, or the subscription no
  longer allows changes ("This import stopped: <reason>. The rows added before it stay.").
- **B32. No undo.** Release 1 has no lead deletion; the preview's confirmation says imported leads can't be removed in
  bulk. A later release may add "remove this import's leads".

### 4.5 Rows not added, and uploading again

- **B33. Already imported:** each added row keeps a fingerprint, the SHA-256 of its matched values as read (contacts as
  stored, the trip, the stage, the owner value, the note text) with the import's kind. A row whose fingerprint an
  earlier import of the agency added is left out as "Already imported on 12 Oct", unless the importer ticks "Add them
  again"; a row equal to an earlier row of the same file is always left out as "Same as row 12". So uploading the same
  file again, or the whole original with a few rows fixed, adds only what's new.
- **B34. The report of rows not added** is made when the add ends (done, stopped or failed): the uploaded format, the
  original columns in their order with their values as they were, and two first columns, "Why it wasn't added" (one
  sentence) and "Row" (its row in the uploaded file). Its name is "<file name> - rows not added.xlsx" (or .csv).
- **B35. Fixing them:** the importer fixes the rows in Excel and uploads the report; B9 skips the two columns, B33
  leaves out anything already added.
- **B36. Downloading the report** is an export: `freshProcedure`, `lifecycle: "export"`, a 5-minute link, and an audit
  entry.

### 4.6 Lead export

- **B37. What is exported:** the list exactly as the person sees it: their scope (`scopeFilter`: a salesperson's own
  leads whatever they ask), the view, the stage, the owner, source, destination and trip type filters, and the search,
  newest first. At most 1,00,000 leads: more stops the export with "This export has more than 1,00,000 leads. Narrow
  it with a filter."
- **B38. Columns**, in this order: Name; Phone (`+91 98765 43210`); Email; Instagram; Returning (Yes or blank); Stage;
  Destination; Travel from; Travel to; Travel month ("Dec 2026" or "Flexible"); Adults; Children's ages ("7, 4");
  Budget (rupees, a number); Budget basis; Departure city; Trip type; Hotel category; Food; Room type; Owner (their
  name; "Former member" for someone removed; blank for none); Source; Source detail; Added on (date and time in the
  agency's zone); Next follow-up (its due time); Next follow-up note (its line); Lead link (the lead's address). The
  import's guesses (B9) know every header, so an export imports back: Added on is guessed as Enquiry date, and
  Returning, the two follow-up columns and Lead link as Don't import. Not exported: notes, the timeline, repeat
  enquiries, tasks but the next one, files.
- **B39. Formats:** Excel (.xlsx, the default) with a bold, frozen header row, dates and times as date cells, numbers
  as numbers; or CSV (UTF-8 with a byte-order mark, so Excel shows every script; CRLF line ends; every cell quoted).
  The file is named `leads-2026-10-19-1612.xlsx`.
- **B40. Formula safety:** an .xlsx cell is always a value, never a formula. A text cell that starts with `=`, `+`,
  `-`, `@`, a tab or a carriage return gets a leading apostrophe, in both formats; in .xlsx the phone column, which our
  code writes from a validated number, is the one exception, so a phone stays "+91 98765 43210". In CSV the phone gets
  the apostrophe too, which Excel shows: one reason Excel is the default.
- **B41. Runs as a job** (section 7): the count first (for the progress), then pages of 1,000 leads by keyset, each in
  its own transaction, each with its next follow-ups and destination names, written to the file as they come. The
  requester's access is resolved afresh when the job starts; one who lost `leads:view` gets a failed export.
- **B42. The file** is stored as a generated file of the export (files' `storeGeneratedFile`, the export's id as the
  attachment id, so a retried job stores it once), downloadable for 24 hours through a 5-minute link by its requester
  only, then deleted (B54).

### 4.7 Staff import

- **B43. Fields:** Name (needed); Username; Email (one of the two needed, as Add staff); Phone (optional, B51); Role
  (a column, or one role for the file). Values read with Add staff's own schemas (`personName`, `staffUsername`,
  `emailAddress`, `phoneNumber`).
- **B44. Rows not added:** no name; neither username nor email; a username or email another row of the file uses
  ("Same username as row 4"); an email on another organization's account; an invalid username or email; a role still
  unmatched; the Owner role ("Add an Owner from Add staff, one at a time"); a role above the importer's own (the
  no-escalation rule, `assertMayHandleRole`). A row whose username or email is already an active member here is
  "Already on your staff" and left out, not an error.
- **B45. All or nothing:** the rows ready are added in one transaction, or none are. It holds the organization's row
  (`FOR NO KEY UPDATE`, as Add staff does), counts the active members, and refuses the whole file when they plus the
  rows to add pass the plan's seats (`IMPORT_OVER_SEAT_LIMIT`: "This file adds 16 people, and your plan has 14 seats
  free."), so two imports, or an import and an Add staff, can't both take the last seats. The preview counts the same
  way and turns Add off.
- **B46. Temporary passwords are made in the browser**, as Add staff's are (`temporary-password.ts`: 12 characters
  with no 0/O, 1/l/I, so they can be read out over the phone, and none starts with a formula character). When the
  importer confirms Add, the browser makes one per row to add and sends them to the api 25 at a time; the api hashes
  each with Better Auth's hasher (about 70 ms each, off the event loop) and keeps only the hash on the import's row.
  Then the api queues the add. Plain passwords exist only in the browser's memory and in those requests, never in the
  database, a job, a log, storage, the query cache, IndexedDB or web storage.
- **B47. The add job** resolves the importer's access afresh (they must still hold `staff:manage`, as B31 asks for
  leads), re-reads the file, checks every row again, then in one transaction (B45) writes each account
  as Add staff does (`insertStaffAccount`: the user, the password account from the stored hash, the membership with its
  role, `mustChangePassword`, and `staff.created`), clears the hashes, and links each row to its member. A row that
  fails now (a username taken meanwhile) fails the whole add: the import returns to the preview with that row marked,
  the hashes cleared, and the browser's passwords dropped; pressing Add again makes new ones.
- **B48. The one-time sheet** is a CSV the browser writes from its own memory once the add is done: Name, Username,
  Email, Temporary password, Organization code, Sign-in page, with the same formula rule as B40. It is saved with a
  download link to a Blob; nothing is sent. The passwords stay in the tab's memory until the importer leaves the
  import's screen.
- **B49. Everyone must change their password at first sign-in**, as Add staff's people do (`mustChangePassword`).
  No email is sent.
- **B50. A lost sheet:** "Make new passwords" gives a fresh temporary password, one person at a time through the
  existing `staff.resetPassword`, to each person of the import who still must change theirs (they never signed in),
  and offers a new sheet. Someone who already chose their own password is left alone.
- **B51. Staff phones:** staff gain an optional phone, set by Add staff (a new optional field), by import, and changed
  from the staff row's menu (**Change phone**), shown on the staff list and exported. It is not a sign-in name, not
  unique, and never in the audit log.

### 4.8 Staff export

- **B52.** The active staff, oldest first, as the Staff screen lists them: Name; Username; Email (blank when they have
  none, never a placeholder address); Phone; Role; Joined (date); Status (Active, or Must change password); Last active
  (date). Same formats, formula rule, job, file, 24 hours and downloads as the lead export (B39-B42), named
  `staff-2026-10-19.xlsx`.

### 4.9 Keeping and deleting

- **B53. An import's file and its report** are kept for 7 days after the import ends (done, stopped, failed, cancelled
  or unreadable), or after its last change while it waits at a step; then the console's sweep deletes both files for
  good and empties what the import keeps of the rows (samples, values, examples, hashes). The counts and outcomes stay.
- **B54. An export's file** is deleted the same way 24 hours after it is ready.
- **B55. Any erasure** (a customer or a removed member) deletes, at once and in its own transaction, every kept import
  file, report and export file of the organization, and empties every import's kept values (section 9).

## 5. Data

Every new table is an organization table (ADR 0028): `organization_id` referring to `organization` with
`ON DELETE RESTRICT ON UPDATE RESTRICT` (relation named `organization`), `SELECT app_enable_org_rls('<table>');` in
the migration that creates it, UUID v7 ids, keys and unique constraints that include `organization_id`, CHECK lists
for fixed values, and a row-creating fixture in its module's file in `packages/db/test/org-table-fixtures/`
(`imports.ts`, `exports.ts`). None is `appendOnly`: the runtime role updates them all, and deletes `import_row` and
`import_value_match` rows when a check runs again. None is soft-deleted. Ids of records in other modules (leads,
people, members) are plain uuids, as `attachment.record_id` is, with no foreign key.

- **import_batch** (imports): `kind` (leads, staff); `status` (uploading, reading, unreadable, matching, checking,
  checked, adding, done, stopped, failed, cancelled, expired); `file_attachment_id` → `attachment` (with the
  organization); `file_name`; `file_kind` (csv, xlsx); `file_sha256`; `sheet_name`; `unreadable_reason` and
  `failure_reason` (CHECK lists); `rows_total`, `rows_to_add`, `rows_done`; the choices: `default_stage`,
  `default_owner_user_id`, `budget_basis`, `default_role_key`, `add_blocked`, `add_already_imported`;
  `stop_requested`; `report_attachment_id` → `attachment`; `started_by`, `impersonated_by`; `created_at`,
  `checked_at`, `add_requested_at`, `finished_at`, `keep_until`. A partial unique index on `(organization_id)` where
  `status = 'adding'` (B29); an index on `(organization_id, kind, id DESC)` for Recent imports; one on
  `(organization_id, file_sha256)`.
- **import_column**: the batch (`(organization_id, batch_id)` → `import_batch`), `position`, `header` (as read),
  `samples` (text[], at most 3), `distinct_values` and `distinct_counts` (at most 50, B11), `field` (null or a CHECK
  list of both kinds' fields). Unique `(organization_id, batch_id, position)`.
- **import_value_match**: the batch, `field` (owner, stage, role), `value` (as read), `rows`, `target` (a user id, a
  stage or a role key; null for the default), `matched_by` (name, username, email, first name, word, chosen, none).
  Unique `(organization_id, batch_id, field, value)`.
- **import_row**: the batch, `row_number` (in the file; the header is row 1), `plan` (new, returning, enquiry,
  blocked, already_imported, not_added), `reasons` (text[] of reason codes with their field), `noted` (a value went to
  the note, B21), `new_destination`, `outcome` (null until the add: added, merged, left_out, not_added),
  `lead_id`, `person_id`, `member_id`, `fingerprint` (bytea, added rows only), `password_hash` (staff, until the add),
  `example_name` and `example_value` (at most 120 characters, for the preview's examples). Unique
  `(organization_id, batch_id, row_number)`; an index on `(organization_id, batch_id, plan)` for the preview's
  counts; a partial index on `(organization_id, fingerprint)` where it is set (B33, read with `= ANY`, which row-level
  security lets use the index); one on `(organization_id, person_id)` for erasure.
- **import_header_match**: `kind`, `header_key`, `field`, `updated_at`. Unique `(organization_id, kind, header_key)`;
  written by upsert (not a soft-delete model).
- **data_export** (exports): `kind` (leads, staff); `format` (csv, xlsx); `status` (making, ready, failed, expired);
  `filter` (jsonb: the list's input as the person sent it, validated by its contract when read, the search emptied once
  the file is made; ADR 0028's "payload kept as received"); `failure_reason`; `rows_total`, `rows_done`;
  `file_attachment_id` → `attachment`; `requested_by`, `impersonated_by`; `created_at`, `ready_at`, `expires_at`.
  An index on `(organization_id, requested_by, id DESC)`.
- **member.phone_e164** (identity, a sign-in table: no row-level security; only identity reaches it): nullable E.164.
- **Files:** three record types. `import_batch` accepts only `text/csv` and
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, at most 10 MB, and those two types go nowhere
  else (`VALIDATION`/`CONTENT_TYPE_NOT_ALLOWED`). `import_report` and `data_export` are system-made and short-lived:
  only `storeGeneratedFile` writes them, nobody removes them by hand, and the platform's sweep deletes them for good
  (section 9).
- No migration seeds anything; `deleteOrganizationRows` purges the new tables with the rest.

## 6. Modules, permissions and api

### 6.1 The spreadsheets adapter (`packages/integrations/src/spreadsheets/`)

A port and two adapters (ADR 0008), the only code that imports the libraries:

- **Port `Spreadsheets`:** `read(bytes, { kind, maxRows, maxColumns, maxCellLength })` returns the sheet's name, its
  header row and rows of cells (text, or a date as `yyyy-mm-dd`), or throws `SpreadsheetUnreadableError` with one of
  B5's reasons; `writer({ kind, sheetName, columns })` returns a writer that takes rows in batches (`write(rows)`) and
  ends with the file's bytes (`finish()`), holding only the compressed output. Columns say their kind (text, phone,
  number, date, date-time) for B39 and B40.
- **Real adapter:** CSV with `csv-parse` and `csv-stringify` (the `csv` project: maintained, MIT, no dependencies);
  .xlsx read with `read-excel-file` (maintained, MIT), after a bounded pre-inflate with `fflate` (B4); .xlsx written by
  our own small streaming writer on `fflate`'s `Zip` (one sheet of values, a styles part for the bold header and the
  date formats). Versions pinned exactly, at least a day old (pnpm's rule; on 19 Oct: `csv-parse` 7.0.3,
  `csv-stringify` 6.9.0, `read-excel-file` 9.3.12, `fflate` 0.8.3). Not SheetJS: npm's `xlsx` stops at 0.18.5
  with published advisories, and newer versions come only from its own CDN. Not ExcelJS: no release since October
  2023, on old dependencies. Not `write-excel-file`: it builds the whole sheet in memory (below).
- **Why our own writer:** measured on a laptop with Node 24, 50,000 leads of 16 columns: `write-excel-file` took
  1.9 s and the process grew from 64 MB to 430 MB; a streaming writer on `fflate`, fed 1,000 rows at a time, took
  1.2 s and peaked at 130 MB, and `read-excel-file` read its 50,000 rows back. The pilot runs the api and the worker in
  one 512 MB container.
- **In-memory adapter:** sheets as JSON bytes, for domain tests that need rows without building a workbook, and a way
  to make `read` fail with any reason.
- dependency-cruiser's `vendor-sdks-only-in-integrations` adds the four libraries.

### 6.2 imports and exports (new domain modules, L0)

Two business modules at L0 beside catalog and tasks, so crm (L1) may call them and they never call crm or today
(`business-modules-call-down` gains them).

- **imports:** batches, columns, value matches, header memory and rows; the reader (`imports.read-file`); the guesses;
  the status rules; the report writer; the staff import (its fields, check and add), which calls identity below it;
  `withdrawImportFiles` (erasure's step) and the sweep's steps for the platform.
- **exports:** the export row, the file's making (a kind's row source, the writer, `storeGeneratedFile`), its download
  link and its audit entries; the staff export's row source, from identity; `withdrawExportFiles` (erasure's step)
  and the sweep's steps.
- Contracts: `@travel-crm/contracts/imports` and `@travel-crm/contracts/exports` (shared shapes); the lead fields and
  the lead export's input in `@travel-crm/contracts/crm`; the staff fields and the password input in
  `@travel-crm/contracts/identity`. Strict input schemas, output schemas.

### 6.3 crm (lead import and lead export)

- **One save path.** `createLead`'s save becomes one function, `saveEnquiry(tx, access, enquiry, now, options)`, that
  the form and the import both call: match the person, fill missing contacts, find the open lead, then a repeat
  enquiry, or a new lead (Returning when known). The form passes its `whenOpenLead`; the import passes "add to it",
  its owner and stage, its created date, and `notify: false` (B18).
- `lead-import.ts` (the fields, reading a row into an enquiry, the check, the add, the owner notices) and
  `lead-export.ts` (the row source: `leadListQuery` a page at a time, with the export's filter through the list's own
  `filterFor`, and `exportCountQuery` beside it in `lead-list-query.ts`).

### 6.4 identity

- `matchLeadWorkers(organizationId, values)` (B11; names, usernames and emails never leave identity),
  `addImportedStaff(database, access, rows, seatLimit)` (B45, B47; through `insertStaffAccount`, with
  `assertSeatsFree` counting the whole file), `staffExportRows(organizationId)` (B52), and the staff phone in
  `createStaff`, `listStaff` and a new `changeStaffPhone`.

### 6.5 Permissions and procedures

No new permission. Every procedure is built from `procedures.ts`; inputs name the import or export by id only.

- **`leadImports`** (the crm plan module): `start` (records the import and returns its presigned upload),
  `confirmUpload`, `match`, `decide`, `stop` and `cancel` on `orgProcedure.requires("leads:create", "leads:assign")`;
  `add` on `freshProcedure` with the same permissions; `get` (status, columns, values, counts, progress), `rows` (a
  page of example rows by plan and reason) and `recent` as views; `reportLink` on `freshProcedure`,
  `.meta({ lifecycle: "export" })`.
- **`leadExports`:** `start` and `downloadLink` on `freshProcedure.requires("leads:view")`, and `get` on
  `orgProcedure.requires("leads:view")`, all `.meta({ lifecycle: "export" })`, so a suspended Owner can still make,
  follow and download one.
- **`staffImports`** (core): every procedure on `freshProcedure.requires("staff:manage")` (staff management): `start`,
  `confirmUpload`, `match`, `decide`, `setPasswords` (at most 25 a call), `add` and `cancel` as changes; `get`, `rows`
  and `recent` as views.
- **`staffExports`** (core): `start`, `get` and `downloadLink` on `freshProcedure.requires("staff:manage")`, as
  exports.
- **`staff.changePhone`** on `freshProcedure.requires("staff:manage")`.

An import or export of another kind or organization, or one not the requester's (exports), is `NOT_FOUND`. A step
asked out of turn is `CONFLICT`/`IMPORT_NOT_READY`. New reasons, each with its sentence in `errors.json`:
`CONTENT_TYPE_NOT_ALLOWED`, `IMPORT_NOT_READY`, `IMPORT_ALREADY_RUNNING`, `IMPORT_NEEDS_NAME_AND_CONTACT`,
`IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE`, `FIELD_MATCHED_TWICE`, `IMPORT_OVER_SEAT_LIMIT`, `EXPORT_NOT_READY`,
`EXPORT_EXPIRED`.

### 6.6 The web app

- **Shared pieces** (`apps/web/src/imports/`, `apps/web/src/exports/`): `ImportFileStep` (the file button, the upload
  through `uploadFile()`, its progress and Try again), `ColumnMatcher` (columns, samples and a field `Select` each; a
  `Table` or an `ItemGroup`), `ValueMatcher` (a column's values, counts and a target `Select` each), `useImport(id)`
  (polling every 2 seconds while reading, checking or adding), `ImportProgress`, `ImportCounts`, `RecentImports`,
  `ExportDialog` (what it holds, the format, the progress, Download) and `useExport`.
- **Lead screens** in `apps/web/src/leads/import/` and `leads/export/`; **staff screens** in
  `apps/web/src/organization/staff/import/` and `staff/export/`, with `password-sheet.ts` (B48) and the memory-only
  password store.
- Routes: `/leads/import`, `/leads/import/[importId]`, `/leads/exports/[exportId]`, `/staff/import`,
  `/staff/import/[importId]`, `/staff/exports/[exportId]`. Addresses hold ids only.
- Words in `imports.json`, `exports.json` and the staff and leads files; the sample files in
  `apps/web/public/samples/` (no organization data).

## 7. Jobs and events

Each step is a listener on an event published in the step's own transaction (ADR 0009), so a lost queue send can't
strand an import. Payloads hold ids; every listener does nothing for an import or export no longer at its step, so a
second run is harmless.

- `import.uploaded` (`{ importId }`) → `imports.read-file`: reads the file, its columns and their values.
- `import.columns-matched` (`{ importId, kind }`) → `crm.check-lead-import` or `imports.check-staff-import`, each
  acting on its own kind: the dry run (B25).
- `import.add-requested` (`{ importId, kind }`) → `crm.add-lead-import` or `imports.add-staff-import`: the add (B26,
  B47), then the report and the notices.
- `export.requested` (`{ exportId, kind }`) → `crm.make-lead-export` or `exports.make-staff-export`: the file (B41).
- `import.finished` and `export.made` (the same payloads): no listener yet; later releases' summary tables follow them.

- The listeners are added to `apps/api/src/worker-jobs.ts`. The lead add fits pg-boss's 15-minute attempt (about six
  minutes for 10,000 rows); a re-dispatch after an expiry takes turns on the import's row (B26) and finds the rows done.
- The worker acts as the importer or requester: `{ organizationId, userId, source: "job", impersonatedBy }`, with
  their access resolved afresh (B31, B41).
- **The console's sweep:** `platform.sweep-bulk-files`, hourly, a schedule in `apps/api/src/console-jobs.ts`: imports
  past `keep_until` and exports past `expires_at`, a batch at a time across organizations, each in a platform
  transaction: deletes their files for good (the deletions' outbox), empties the kept values, marks them expired.
- Job data and errors hold ids only; a failed job's error names the import or export, never a file's content.

## 8. Audit and notifications

- **Audit** (`recordAudit` in the change's transaction; actions read `<entity>.<what happened>`, each with its sentence
  in `audit.json`):
  - every imported row's own entries, exactly as by hand (`person.added`, `person.edited`, `lead.added`,
    `lead.repeat-enquiry`, the destination added; `staff.created` with the import's id), the importer as the actor
    with source `job`;
  - `import.started` (Add pressed: kind, rows to add), `import.finished` (done, stopped or failed: the counts),
    `import.cancelled`, `import.report-downloaded`;
  - `export.made` (kind, format, rows, the filter by ids and fixed values, and `searched: true` instead of the search
    text) and `export.downloaded`, for leads and staff alike: every export is an entry, as the owner asked, because it
    carries customers' phone numbers;
  - `staff.phone-changed` (no number).
  Snapshots never hold a cell's value, a file's name (it may name a customer) or a password.
- **Notifications** (`notify()`, bell and push, opt-outs apply), each kind in `kinds.ts` with its words:
  - `import.finished` to the importer: "Your import is done: 1,094 new leads, 63 repeat enquiries. 129 rows weren't
    added." (or stopped, or failed), linking to the import;
  - `lead.imported` to each owner other than the importer, once per import: "120 leads from an import are now yours"
    (and "and 12 repeat enquiries on your leads"), linking to their Leads list filtered by source Import;
  - `export.ready` to the requester: "Your leads export is ready" (or staff), linking to the export's page.
  The staff import sends none: its importer is on the screen for the seconds it takes, and the passwords are there.

## 9. Erasure and purge

- **Erasing a customer** (`eraseCustomerParts`) and **erasing a removed member** both call imports'
  `withdrawImportFiles(tx, organizationId, now)` and exports' `withdrawExportFiles(tx, organizationId, now)` in the
  erasure's platform transaction: every kept import file, report and export file of the organization is deleted for
  good (through the deletions' outbox, as `deleteRecordFiles` does), every import's samples, values, examples and
  hashes are emptied, and the person's import rows lose their fingerprints and ids (the counts stay). The
  organization's exports of the platform already go the same way (`expireOrganizationExports`).
- A file can't be searched for one person, so the whole set goes; it is a week's worth at most (B53).
- `export.made` and `import.*` audit entries hold no personal data, so `redactAuditEntries` has nothing new.
- **Purge:** the new tables are purged with the rest (`deleteOrganizationRows` reads the catalog), and their files with
  the organization's storage folder.
- **The erasure checklist** (`packages/domain/src/platform/erasure.ts`) gains the step, and its test gains an import and
  an export holding the person.

## 10. The demo

- `resetDemoOrganization`'s sample leads gain two with source Import and the detail "september-enquiries.xlsx", so the
  source shows in the list and on a lead. No import batch or file is kept in the demo: its nightly reset would only
  delete them again.
- Visitors may try an import in the demo; whatever they add is gone by morning. The sample files (section 6.6) give
  them something to upload.

## 11. Performance (ADR 0028)

In the performance tests' own database, with the seeded large agency (50,000 leads, 500 staff):

- **Import of 10,000 rows:** reading within 2 s (measured: `read-excel-file` read 5,000 rows of 16 columns in 0.1 s,
  `csv-parse` in 0.02 s); the check within 15 s, its lookups one query per kind with `= ANY` on the live unique indexes,
  checked with `EXPLAIN` as `app_runtime` inside `forOrg` (a plan read as another role proves nothing); the add within
  3 minutes, with progress at least every 50 rows and no transaction longer than one batch. The parsed file is held in
  the worker's memory (under 20 MB at the limits).
- **Export of 50,000 leads:** within 60 s; keyset pages of 1,000 on `leadListQuery`, never `OFFSET`, each page its own
  transaction, on the list's partial indexes (`lead_open`, `lead_open_by_owner`) and checked with `EXPLAIN`; the
  worker's resident memory under 200 MB throughout (the streaming writer alone peaked at 130 MB, section 6.1). The
  file is about 3 MB as .xlsx and 9 MB as CSV.
- **Staff import of 500 rows:** the browser's 20 calls of 25 passwords each within 5 s apiece; the add's one
  transaction within 10 s.
- Recent imports, the preview's counts (a `GROUP BY` on `import_row`'s index) and the staff export answer within
  150 ms.

## 12. Journeys and tests

**Journeys** on phone and desktop, with axe after each:

1. Import a CSV of 20 leads whose columns are guessed; owners from an Owner column; add; the leads show with source
   Import and the right owners, who each get one notice.
2. Import an .xlsx with every problem: no contact, a bad phone with an email, Not a lead, a duplicate row, a known
   contact with an open lead, a returning one, a blocked one; the preview shows each group; add; download the rows not
   added; fix them; import that file; only the fixed rows are added.
3. Upload the same file again: "Already imported", nothing added unless chosen.
4. Stop an import halfway; the report holds the rest as "Stopped before this row".
5. Export Everyone · Contacted · Goa as Excel and download it; the audit log shows the export; a salesperson's export
   holds only their own leads.
6. Import five staff with roles; download the passwords; one of them signs in with the organization code and must
   choose a password.
7. A staff file over the seat limit: Add is off with the sentence; the api refuses it too.
8. Export the staff list.
9. A read-only agency: Import is off with its hint; Export still works.

**Tests the builders write first** (besides each rule's own): the adapter's limits, encodings, delimiters, date
cells and the formula rule on both formats (B3-B5, B40), with a zip bomb; the files module's content types per record
type; the one save path giving the form and an import the same result for the same input; the add resuming after a
crash and two overlapping runs adding each row once; two staff imports racing for the last seats; the passwords never
in a job's data, the database or a log (a test greps them); the sweep and erasure deleting files and kept values; the
organization fixtures; the query plans of section 11.

**Visual audit** of every new screen (`docs/ui-build-loop.md`) until no "must" is left.

## 13. Build order: shared pieces first

One branch of shared pieces is built and merged first, so three feature branches can then build in parallel without
inventing their own (`docs/agent-playbook.md`, section 1). Each owns its files; what another needs goes under "Needs
from others".

- **0. Shared, first:** the spreadsheets adapter (6.1); the files module's record types (5); the `imports` and
  `exports` modules' tables, migration and fixtures, the reader, the guesses, header memory, value matches, the
  status rules, the report writer, the export runner, the download links, the sweep and erasure steps and the console
  schedule; their contracts; the `import.finished` and `export.ready` notification kinds; dependency-cruiser; ADR 0030
  (imports and exports, the port, reading in the worker); the web's shared pieces (6.6) and their words.
- **1. Lead import:** crm's one save path and `lead-import.ts`; identity's `matchLeadWorkers`; the `leadImports`
  router; the `lead.imported` kind; the lead import screens and the sample file; journeys 1-4.
- **2. Lead export:** crm's `lead-export.ts` and `exportCountQuery`; the `leadExports` router; the Leads header's
  Export and the export page; journey 5 and the export's performance test.
- **3. Staff import and export:** the staff import in `imports`; identity's `addImportedStaff`, `staffExportRows` and
  the staff phone (its migration, Add staff's field, Change phone); the `staffImports` and `staffExports` routers;
  the staff screens, the password sheet and its store; journeys 6-8.
- **4. Google Sheets:** later, its own spec (section 14).

Branches 1-3 touch shared lists (`worker-jobs.ts`, `app-router.ts`, `errors.json`, `audit.json`, `kinds.ts`) only by
adding lines, so their merges meet at import lines. Journey 9 belongs to whichever of 1 and 2 merges second.

## 14. Google Sheets both ways (later)

Its own spec settles connecting the agency's Google account, which columns sync, which side wins a conflict and how
often it looks. What it will reuse from this release, unchanged:

- **The column-matching screen** (`ColumnMatcher`, `ValueMatcher`), with the sheet's header row in place of a file's
  first row, and the header memory (B9, B10).
- **The lead import's fields and row rules** (B8-B24): a sheet's new row is an import row, through the one save path,
  with source `google_sheet` and the sheet's name as its detail; fingerprints (B33) tell a row already brought in.
- **The batch and row tables**, a sync run being an import of kind leads; the report of rows not added becomes a
  column the product writes back into the sheet.
- **The export's columns** (B38) for the product-to-sheet direction, and the formula rule (B40), with values written
  to the sheet as raw values, never as formulas.
- The spreadsheets port's reading of cells, dates and phones.

## 15. Decisions I made

The owner set the content and four decisions (an imported lead's owner; who may export and what; temporary passwords
on a one-time sheet; every export in the audit log). These calls are mine, each open to change:

1. **The worker reads every file, never the browser:** one reader for preview and import, a zip bomb hurts a job and
   not a phone or the api, and the web app stays free of a spreadsheet library.
2. **10,000 rows and 10 MB per lead file (owner, 2026-10-19), 500 per staff file:** a whole agency sheet fits, a file checks in seconds and
   adds in about six minutes; a bigger one splits.
3. **Stage defaults to New, or one stage the importer picks for the file:** the owner's default, with a way to keep
   2,000 old enquiries off everyone's Today.
4. **Owner, Stage and Role values are matched one value at a time** ("Booked" → Won, "Asha" → Asha Sharma): sheets
   use their own words, and one choice fixes a thousand rows.
5. **Owners not on the staff go to the agency Owner, and the importer may pick another person per name:** your rule
   by default; the importer holds `leads:assign` and could reassign them anyway.
6. **Importing leads needs `leads:create` and `leads:assign` (owner confirmed, 2026-10-19):** an import decides other people's leads; salespeople add
   theirs by hand.
7. **A row fails only for no name, no usable contact, Not a lead, overlong notes or being a repeat; a value we can't
   read goes into the note:** messy rows shouldn't be lost over a typo.
8. **Blocked contacts' rows are left out unless the importer ticks "Add them anyway" (owner confirmed, 2026-10-19):** nobody reads each imported row,
   and release 1 already drops blocked contacts' leads that arrive by themselves.
9. **Rows already imported are recognised by fingerprint and left out:** the same file, or the original with a few
   fixes, adds only what's new.
10. **Rows not added come back as a file in the uploaded format, original columns plus "Why it wasn't added":** fix
    them in Excel and upload that file as it is.
11. **Adding runs 50 rows to a transaction, resumes after a crash, can be stopped, and has no undo:** release 1 can't
    delete leads, so the confirmation says so.
12. **One notice per owner per import, not one per lead:** 300 pushes would bury a salesperson's day.
13. **An Enquiry date column becomes the lead's added date, and Their source follows the file name in the source
    detail:** "waiting since" stays honest and the original channel stays readable, with your source Import kept.
14. **One import adds at a time in an agency:** two imports of the same people would make each other's leads repeat
    enquiries.
15. **Exports default to Excel, and their columns are the import's fields:** typed cells, a phone without a visible
    apostrophe, and an export that imports back. Notes, timeline and files stay in the product.
16. **Our own streaming .xlsx writer on fflate; csv-parse, csv-stringify and read-excel-file for the rest:** a
    whole-sheet writer reached 430 MB for 50,000 leads against 130 MB streaming, in a 512 MB pilot container; SheetJS
    and ExcelJS aren't maintained on npm.
17. **Export files last 24 hours, for their requester only; each download is an audit entry too:** a file of phone
    numbers should be short-lived.
18. **Import files and reports are kept 7 days, then deleted by the console's sweep; any erasure deletes them at once:**
    a week is enough to fix rows, and no file outlives an erased person.
19. **Staff import is all or nothing for the rows ready:** a half-added team with half a password sheet is worse than
    a clear refusal.
20. **Temporary passwords are made in the browser, as Add staff's are, and the api keeps only their hashes:** the
    server never holds a password it could show again, and there is no key to keep.
21. **A lost sheet is replaced by new passwords for those who haven't signed in:** nobody is locked out, and nobody
    who chose a password is reset.
22. **An import can't give the Owner role:** Owners are added one at a time from Add staff.
23. **Staff get an optional phone, with Change phone on the staff row:** you asked for phones in the import; release
    5's calling can use them.
24. **Imported leads past New have no first-reply time:** we don't know it, and later reports show it as unknown.
