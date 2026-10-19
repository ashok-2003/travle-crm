# @travel-crm/integrations

Adapters to the outside world (spec 3): storage, jobs, email, push and PDFs. Domain code never calls a vendor SDK;
it calls a port defined here, and the api and worker pass in the real adapter. Tests pass in the in-memory one.

| Import                                  | Port                   | Adapters                                                                                                                 |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@travel-crm/integrations/storage`      | ObjectStorage          | `createS3Storage` (S3, MinIO locally), `createMemoryStorage`                                                             |
| `@travel-crm/integrations/jobs`         | JobQueue, JobRunner    | `createPgBossJobs`, `createMemoryJobQueue`, `createMemoryJobRunner`                                                      |
| `@travel-crm/integrations/email`        | EmailSender            | `createSmtpEmailSender` (SMTP or SES's SMTP), `createMemoryEmailSender`; `renderEmail`                                   |
| `@travel-crm/integrations/push`         | PushSender             | `createWebPushSender`, `createMemoryPushSender`                                                                          |
| `@travel-crm/integrations/pdf`          | `renderPdf`, `imageOf` | React-PDF with the brand's fonts and the organization's logo; the `sample` template                                      |
| `@travel-crm/integrations/spreadsheets` | Spreadsheets           | `createSpreadsheets` (csv-parse, read-excel-file; csv-stringify, our .xlsx writer on fflate), `createMemorySpreadsheets` |

- Only this package imports vendor SDKs (pg-boss, AWS SDK, nodemailer, web-push, React-PDF, the spreadsheet libraries). dependency-cruiser
  enforces it, and this package imports nothing of ours except `@travel-crm/brand`.
- Job data holds ids, never personal data: pg-boss's tables have no row-level security.
- A logo's bytes are read before anything decodes them (`pdf/image-type.ts`, `pdf/png.ts`): `imageOf` gives a PNG's
  or JPEG's type and size, reading a PNG as png-js reads it (React-PDF and pdfkit decode with png-js 2.0.0, which
  sizes what it allocates from the last IHDR and the bit depth), so a second IHDR, an IHDR not 13 bytes long, a bit
  depth PNG doesn't allow, an interlaced file (png-js misreads narrow ones) or a tRNS png-js skips makes it no image.
  `isSafeToDraw` then counts, without keeping it, what a PNG's pixel data inflates to (no more than its header's rows)
  and checks each row's filter type is one png-js knows: png-js throws at any other, and at a zlib error, inside a
  callback nothing catches (fuzzed: no file both checks pass makes png-js throw). A JPEG is drawn from only the
  segments that draw it (`pdf/jpeg.ts`, `jpegForDrawing`): React-PDF walks every marker with jay-peg, whose EXIF
  reader a hundred bytes can take out of memory, so `renderPdf` never hands it the metadata (EXIF, XMP, ICC,
  comments), and `isSafeToDraw` refuses a JPEG whose segments jay-peg would read otherwise.
- `@travel-crm/integrations/testing` (`test/testing.ts`, for tests only; dependency-cruiser checks) has the test
  images every package uses: `tinyPng`, `tinyJpeg`, `pngOfSize`, the chunks to build others, and the PNGs made to get
  past a logo's checks.

## The in-memory jobs twin

`createMemoryJobQueue` and `createMemoryJobRunner` stand in for pg-boss in the domain's tests. One contract suite
(`test/jobs/job-adapter-contract.ts`) runs against both: data reaches its queue's handler, a failing job is retried up
to its limit and listed with the cut-down error pg-boss stores (an error our code wrote keeps its masked message,
anyone else's only its names and codes), a
job id repeated on its queue queues nothing (another queue may reuse it), ids are UUIDs, queue names are checked
wherever one is named, a queue has one schedule, and an unknown time zone is refused. Where the twin can't act like
pg-boss:

- **No clock.** Jobs run when a test calls `runQueued()`. `startAfter`, `expireInSeconds` and the retry delay are
  ignored, and a failing job's retries run at once.
- **One job at a time, in the order sent.** pg-boss runs jobs concurrently and may deliver one again after it expires.
  The twin can't overlap two runs of a job, so tests that need that call the handler twice at once themselves (as
  `packages/domain/test/jobs/run-listener.test.ts` does).
- **No log.** pg-boss logs each failing job (queue, job id, the error's names and codes) to `log`; the twin only lists
  the cut-down error in `failed`.
- **The retry policy is the default one.** A job without `retryLimit` gets `defaultRetryPolicy`'s limit; pg-boss uses
  the policy its queue was created with (`retryPolicy` in its settings).
- **Ids are remembered for ever.** pg-boss deletes finished jobs after its retention (7 days by default), and then
  the same id queues again.
- **Cron expressions aren't read.** pg-boss refuses one it can't parse when `schedule()` is called; the twin keeps
  whatever it is given. The worker checks each expression's shape before scheduling it.
- **A second `work()` on a queue replaces the handler;** pg-boss adds a second worker.

## Reading spreadsheets within bounds

A file is read only in the worker (ADR 0030), and every read is bounded before a library sees it:

- **CSV** (`read-csv.ts`): decoded as UTF-8 (with or without a byte-order mark), UTF-16 with one, or Windows-1252; the
  delimiter is the one the first record uses most; each record goes to the shaper as it is parsed, so a row past the
  limit stops the parse, and a text with a NUL byte is a binary file under a .csv name.
- **.xlsx** (`read-xlsx.ts`, `bounded-unzip.ts`, `sheet-sizer.ts`, `xml-elements.ts`): a compound file is an old
  .xls, or a protected workbook when it holds `EncryptedPackage`. Every XML part read-excel-file would inflate first
  streams through fflate's `Unzip`, 4 KB of compressed bytes a push, against a 50 MB running total. The same pass
  sizes each part with saxen 11.2.0 from npm (pinned, D1), of which read-excel-file vendors a copy, reading names and
  attributes as the reader does (every prefix dropped, `xmlns:` ones too, entities decoded, any quoting, comments,
  CDATA and processing instructions skipped; `xml-elements.test.ts` holds the two parsers to the same events):
  read-excel-file keeps an array for every row number up to the last and pads each to the widest non-empty column, so
  a sheet with more rows, or a row or cell numbered past twice the row limit, or a cell that isn't self-closing past
  the column limit, is refused before it runs; so is markup a megabyte long with nothing finished in it, and elements
  nested over a hundred deep. The first sheet is found as the reader finds it, keeping only the workbook's `sheet`
  and `Relationship` elements (either of its two parts holding over 10,000 elements is refused at once, X8), and a sheet or relationship whose attributes meet under one name is refused.
- **Its own thread** (`read-xlsx-in-thread.ts`, `xlsx-thread.ts`): all of that, and read-excel-file, runs in a
  `worker_threads` thread with a 128 MB heap, a 16 MB young generation, a 4 MB stack and a minute, so whatever the
  sizing doesn't foresee costs that thread alone. Running any of them out is `too_large_unpacked`; a thread that throws
  or ends without an answer is `not_a_spreadsheet` (X9); one whose module is missing is a plain error naming its code. The bytes are handed over (transferred), and only the bounded rows come back.
  From the source (development and tests), plain Node runs the thread's TypeScript, finding `.ts` files by the `.js`
  names our imports use through a resolve hook; the api's bundle runs its own `xlsx-thread.mjs` entry, beside the
  chunk that starts it (`apps/api/scripts/bundle.ts`). The worker reads a one-cell workbook this way before it starts
  (`checkXlsxReading`).
- **Column names** (`sheet-shape.ts`): the first non-empty row names the columns through `nameHeaders`, exported with
  `columnLetters` so a Google Sheet's header is named the same way: a blank is "Column C", a repeat gains "(2)".
- **Cells** (`cell-text.ts`): a whole number keeps every digit (`919876543210`, never `9.19876543210E+11`), a date cell
  is its day in UTC, one leading apostrophe is dropped, and a cell is cut one character past the limit.
- **Writing** (`write-xlsx.ts`, `write-csv.ts`): values only, never a formula; text starting with `=`, `+`, `-`, `@`, a
  tab or a carriage return gets an apostrophe (`neutraliseFormula`), dates and times in CSV included, but an .xlsx
  phone cell that is digits and spaces after an optional `+`. The .xlsx writer deflates each batch into the sheet's
  entry as it comes and keeps only the compressed output.
- **The in-memory twin** (`memory-spreadsheets.ts`) keeps sheets as JSON and neutralises nothing: the formula rule
  is the real adapter's, and its tests (`write.test.ts`) carry it (D8).
