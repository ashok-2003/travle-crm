# @travel-crm/domain

Business rules, one folder per module (spec section 8). A module's public API is its `index.ts`, imported as
`@travel-crm/domain/<module>`. Inside a module, import its own files freely; across modules, only the other module's
`index.ts`. dependency-cruiser enforces both.

| Module          | What it holds                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `kernel`        | building blocks every module uses: `Actor`, `DomainError`, money, GST, time ([README](src/kernel/README.md)) |
| `identity`      | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md))                        |
| `jobs`          | domain events, the outbox relay, listeners and the worker ([README](src/jobs/README.md))                     |
| `audit`         | the audit log ([README](src/audit/README.md))                                                                |
| `files`         | files attached to records, in object storage ([README](src/files/README.md))                                 |
| `documents`     | numbered documents and their PDFs ([README](src/documents/README.md))                                        |
| `notifications` | `notify()`, the bell, email and push delivery ([README](src/notifications/README.md))                        |
| `share-links`   | links that open one record without signing in ([README](src/share-links/README.md))                          |
| `webhooks`      | the generic webhook intake ([README](src/webhooks/README.md))                                                |
| `rate-limits`   | limits on the public routes ([README](src/rate-limits/README.md))                                            |

Business rule failures throw `DomainError(code, reason, message)`; the API turns the code into an HTTP status and passes
the reason to the web app.
