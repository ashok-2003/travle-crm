# 0008: Ports and adapters for the shared services

Date: 2026-10-15 · Status: accepted · Implements spec sections 3, 9 and 10

## Decision

- **`@travel-crm/integrations` holds every adapter to the outside world**: storage, jobs, email, web push and PDFs.
  Each adapter folder has a _port_, an interface saying what the domain needs (`ObjectStorage`, `JobQueue`), the real
  adapter (S3, pg-boss) and an in-memory one for tests.
- **Domain code takes ports as parameters.** It never imports a vendor SDK, and it never builds an adapter itself: the
  api and worker build the real ones from the environment and pass them in. Tests pass the in-memory ones.
- **dependency-cruiser enforces it:**
  - `vendor-sdks-only-in-integrations`: only `packages/integrations` imports pg-boss, the AWS SDK, nodemailer,
    web-push or React-PDF;
  - `integrations-are-adapters-only`: adapters import nothing of ours except `@travel-crm/brand`;
  - `brand-depends-on-nothing-of-ours`: every layer may read the brand package, so its code reads no other package.
- **`@travel-crm/brand` holds the product's identity** (spec 10): name, colours, fonts, contacts. The contact values
  on `.example` addresses are not confirmed yet; the product owner replaces them before the first staging deploy.
- **Packages export folders, not files.** `@travel-crm/domain/<module>`, `@travel-crm/contracts/<module>` and
  `@travel-crm/integrations/<adapter>` resolve to `src/<name>/index.ts` through one wildcard export each, so a new
  module needs no `package.json` change.
- **Job data holds ids, never personal data.** pg-boss's tables live outside row-level security; the worker reads
  records inside `db.forOrg()`.

## Context

- **Why ports, not direct SDK calls.** Tests run against real Postgres but should not need S3, SMTP or a push service
  for every domain rule; the in-memory adapters behave like the real ones where callers depend on it (a presigned
  upload of the wrong size is refused). Swapping S3 for another provider, or SMTP for SES, touches one folder.
- **Why every dependency was added up front.** Plan 3 is built as parallel tracks (see the plan). Adding all of the
  adapters' dependencies in one task means no track edits a `package.json` or the lockfile, so the tracks merge
  without conflicts.

## Consequences

- An adapter's real implementation is tested against a real service in a container (Postgres, MinIO, Mailpit) in
  `packages/integrations/test`. The in-memory adapters are tested there too, so tests that rely on them rely on
  checked behaviour.
- Adding a vendor SDK means adding it to `packages/integrations` and to the rule's list.
