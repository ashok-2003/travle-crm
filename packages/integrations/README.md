# @travel-crm/integrations

Adapters to the outside world (spec 3): storage, jobs, email, push and PDFs. Domain code never calls a vendor SDK;
it calls a port defined here, and the api and worker pass in the real adapter. Tests pass in the in-memory one.

| Import                             | Port                   | Adapters                                                                               |
| ---------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `@travel-crm/integrations/storage` | ObjectStorage          | `createS3Storage` (S3, MinIO locally), `createMemoryStorage`                           |
| `@travel-crm/integrations/jobs`    | JobQueue, JobRunner    | `createPgBossJobs`, `createMemoryJobQueue`, `createMemoryJobRunner`                    |
| `@travel-crm/integrations/email`   | EmailSender            | `createSmtpEmailSender` (SMTP or SES's SMTP), `createMemoryEmailSender`; `renderEmail` |
| `@travel-crm/integrations/push`    | PushSender             | `createWebPushSender`, `createMemoryPushSender`                                        |
| `@travel-crm/integrations/pdf`     | `renderPdf`, `imageOf` | React-PDF with the brand's fonts and the organization's logo; the `sample` template    |

- Only this package imports vendor SDKs (pg-boss, AWS SDK, nodemailer, web-push, React-PDF). dependency-cruiser
  enforces it, and this package imports nothing of ours except `@travel-crm/brand`.
- Job data holds ids, never personal data: pg-boss's tables have no row-level security.
- A logo's bytes are read before anything decodes them (`pdf/image-type.ts`, `pdf/png.ts`): `imageOf` gives a PNG's
  or JPEG's type and size, reading a PNG as png-js reads it (React-PDF and pdfkit decode with png-js 2.0.0, which
  sizes what it allocates from the last IHDR and the bit depth), so a second IHDR, an IHDR not 13 bytes long, a bit
  depth PNG doesn't allow, an interlaced file (png-js misreads narrow ones) or a tRNS png-js skips makes it no image.
  `pixelDataFitsHeader` then counts, without keeping it, what a PNG's pixel data inflates to (no more than its
  header's rows) and checks each row's filter type is one png-js knows: png-js throws at any other, and at a zlib
  error, inside a callback nothing catches (fuzzed: no file both checks pass makes png-js throw).
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
