# @travel-crm/integrations

Adapters to the outside world (spec 3): storage, jobs, email, push and PDFs. Domain code never calls a vendor SDK;
it calls a port defined here, and the api and worker pass in the real adapter. Tests pass in the in-memory one.

| Import                             | Port          | Adapters                                  |
| ---------------------------------- | ------------- | ----------------------------------------- |
| `@travel-crm/integrations/storage` | ObjectStorage | `createMemoryStorage` (tests), S3 (files) |
| `@travel-crm/integrations/jobs`    | JobQueue      | `createMemoryJobQueue` (tests), pg-boss   |

- Only this package imports vendor SDKs (pg-boss, AWS SDK, nodemailer, web-push, React-PDF). dependency-cruiser
  enforces it, and this package imports nothing of ours except `@travel-crm/brand`.
- Job data holds ids, never personal data: pg-boss's tables have no row-level security.
