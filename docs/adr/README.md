# Architecture decision records

Each record states a decision, the context, and the consequences, so it can be revisited knowingly.
The first and largest set of decisions is the Foundation spec: `docs/superpowers/specs/2026-10-13-foundation-design.md`.

| #                                        | Decision                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)                | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                     |
| [0002](0002-row-level-security.md)       | How organization isolation is implemented in Postgres                                   |
| [0003](0003-repository-conventions.md)   | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate              |
| [0004](0004-soft-delete.md)              | Soft delete: hidden rows, refused hard deletes, partial unique indexes                  |
| [0005](0005-roles-and-permissions.md)    | Roles and permissions: our own tables, the catalog, starter roles, no escalation        |
| [0006](0006-identity-and-sessions.md)    | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor |
| [0007](0007-removing-staff.md)           | Removing staff: soft-deleted membership, released email, sessions ended                 |
| [0008](0008-ports-and-adapters.md)       | Ports and adapters: vendor SDKs only in `packages/integrations`, the brand package      |
| [0009](0009-actors-and-domain-events.md) | Actors, domain events and the outbox; what other modules may ask identity               |
