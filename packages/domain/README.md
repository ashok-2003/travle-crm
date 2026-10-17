# @travel-crm/domain

Business rules, one folder per module (spec section 8). A module's public API is its `index.ts`, imported as
`@travel-crm/domain/<module>`. Inside a module, import its own files freely; across modules, only the other module's
`index.ts`. dependency-cruiser enforces both.

| Module          | What it holds                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel`        | building blocks every module uses: `Actor`, `DomainError`, money, GST, time ([README](src/kernel/README.md))                          |
| `identity`      | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md))                                                 |
| `jobs`          | domain events, the outbox relay, listeners and the worker ([README](src/jobs/README.md))                                              |
| `audit`         | the audit log ([README](src/audit/README.md))                                                                                         |
| `files`         | files attached to records, in object storage ([README](src/files/README.md))                                                          |
| `documents`     | numbered documents and their PDFs ([README](src/documents/README.md))                                                                 |
| `notifications` | `notify()`, the bell, email and push delivery ([README](src/notifications/README.md))                                                 |
| `share-links`   | links that open one record without signing in ([README](src/share-links/README.md))                                                   |
| `webhooks`      | the generic webhook intake ([README](src/webhooks/README.md))                                                                         |
| `rate-limits`   | limits on the public routes ([README](src/rate-limits/README.md))                                                                     |
| `subscriptions` | plans, each organization's subscription and payments, the lifecycle, request checks 2 and 3 ([README](src/subscriptions/README.md))   |
| `profile`       | an organization's business profile and setup checklist ([README](src/profile/README.md))                                              |
| `platform`      | the platform console's work across organizations: onboarding, deletion, the demo, the platform log ([README](src/platform/README.md)) |
| `catalog`       | the agency's own catalog: destinations, searched, found or added by name, renamed, merged ([README](src/catalog/README.md))           |
| `tasks`         | follow-ups and tasks on any record, or standing alone ([README](src/tasks/README.md))                                                 |
| `crm`           | people, leads, the lead timeline and blocked contacts ([README](src/crm/README.md))                                                   |
| `today`         | the signed-in person's day, composed from crm's and tasks' public queries ([README](src/today/README.md))                             |

The business modules (release 1 on) are layered, and call only down (dependency-cruiser's `business-modules-call-down`,
spec 6 and 8): `catalog` and `tasks` at L0, `crm` at L1, `today` at the top. An action spanning two modules is the
higher one's, or its router calls both.

Business rule failures throw `DomainError(code, reason, message)`; the API turns the code into an HTTP status and passes
the reason to the web app.
