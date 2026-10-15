# Architecture decision records

Each record states a decision, the context, and the consequences, so it can be revisited knowingly.
The first and largest set of decisions is the Foundation spec: `docs/superpowers/specs/2026-10-13-foundation-design.md`.

| #                                         | Decision                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| [0001](0001-toolchain.md)                 | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                        |
| [0002](0002-row-level-security.md)        | How organization isolation is implemented in Postgres                                      |
| [0003](0003-repository-conventions.md)    | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate                 |
| [0004](0004-soft-delete.md)               | Soft delete: hidden rows, refused hard deletes, partial unique indexes                     |
| [0005](0005-roles-and-permissions.md)     | Roles and permissions: our own tables, the catalog, starter roles, no escalation           |
| [0006](0006-identity-and-sessions.md)     | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor    |
| [0007](0007-removing-staff.md)            | Removing staff: soft-deleted membership, released email, sessions ended                    |
| [0008](0008-ports-and-adapters.md)        | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package         |
| [0009](0009-actors-and-domain-events.md)  | Actors, domain events and the outbox; what other modules may ask identity                  |
| [0010](0010-jobs-and-the-worker.md)       | Jobs and the worker: pg-boss in its own schema, the outbox relay, listeners once per event |
| [0011](0011-files-and-storage.md)         | Files and storage: presigned uploads and downloads, attachments, sensitive files           |
| [0012](0012-pdfs-and-issued-documents.md) | PDFs and issued documents: React-PDF in the worker, frozen content, rendered once          |
| [0013](0013-public-routes.md)             | Public routes: share links at `/p/<token>`, the webhook intake, rate limits in Postgres    |
| [0014](0014-notifications.md)             | Notifications: `notify()`, the bell, email through SMTP, web push, opt-outs                |
| [0015](0015-audit-log.md)                 | The audit log: append-only, in the change's transaction, impersonation recorded            |
| [0016](0016-money-tax-and-time.md)        | Money in integer paise, the tax engine and India GST, time zones, phone numbers            |
| [0017](0017-brand-package.md)             | The brand package: one source of truth, the product-name check, generated icons            |
| [0018](0018-web-app.md)                   | The web app: same origin, the api's types only, brand tokens, the saved cache, the PWA     |
