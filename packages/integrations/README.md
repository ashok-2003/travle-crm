# @travel-crm/integrations

Adapters to the outside world (spec 3): storage, jobs, email, push and PDFs. Domain code never calls a vendor SDK;
it calls a port defined here, and the api and worker pass in the real adapter. Tests pass in the in-memory one.

| Import                             | Port                | Adapters                                                                               |
| ---------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| `@travel-crm/integrations/storage` | ObjectStorage       | `createS3Storage` (S3, MinIO locally), `createMemoryStorage`                           |
| `@travel-crm/integrations/jobs`    | JobQueue, JobRunner | `createPgBossJobs`, `createMemoryJobQueue`, `createMemoryJobRunner`                    |
| `@travel-crm/integrations/email`   | EmailSender         | `createSmtpEmailSender` (SMTP or SES's SMTP), `createMemoryEmailSender`; `renderEmail` |
| `@travel-crm/integrations/push`    | PushSender          | `createWebPushSender`, `createMemoryPushSender`                                        |
| `@travel-crm/integrations/pdf`     | `renderPdf`         | React-PDF with the brand's fonts; the `sample` template                                |

- Only this package imports vendor SDKs (pg-boss, AWS SDK, nodemailer, web-push, React-PDF). dependency-cruiser
  enforces it, and this package imports nothing of ours except `@travel-crm/brand`.
- Job data holds ids, never personal data: pg-boss's tables have no row-level security.

## The in-memory jobs twin

`createMemoryJobQueue` and `createMemoryJobRunner` stand in for pg-boss in the domain's tests. One contract suite
(`test/jobs/job-adapter-contract.ts`) runs against both: data reaches its queue's handler, a failing job is retried up
to its limit and listed with the cut-down error pg-boss stores (`Error: message`, emails and long numbers masked), a
job id repeated on its queue queues nothing (another queue may reuse it), ids are UUIDs, queue names are checked
wherever one is named, a queue has one schedule, and an unknown time zone is refused. Where the twin can't act like
pg-boss:

- **No clock.** Jobs run when a test calls `runQueued()`. `startAfter` and the retry delay are ignored, and a failing
  job's retries run at once.
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
