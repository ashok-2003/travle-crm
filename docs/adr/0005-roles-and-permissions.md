# 0005: Roles and permissions

Date: 2026-10-14 · Status: accepted, defaults open for the product owner's review · Implements spec section 6.5 and
answers open question Q2

## Decision

- **Our own `role` and `role_permission` tables**, organization-owned and under row-level security. Better Auth's
  organization plugin runs without its access-control options (`ac`, `roles`, `dynamicAccessControl`), and
  `member.role` holds our role key.
- **The permission catalog is code**: `packages/domain/src/identity/permissions.ts`, as `module:action`. View
  permissions of assignable records (`leads:view`, `quotes:view`, `bookings:view`) carry a scope, `own` or `all`.
- **The Owner role holds everything**, computed at run time, so it gets new permissions as the catalog grows. It has
  no stored grants and cannot be renamed, edited or deleted.
- **No escalation.** A member may give, edit or delete a role only if they hold everything it allows, at the same or a
  wider scope; may change, reset or remove only someone whose role they could have given; may never change their own
  access. Only an Owner may give or touch the Owner role. Together these keep at least one Owner in every
  organization.
- **Role keys** are stable. Starter roles have fixed keys; a custom role's key is its name in Latin letters plus a
  random suffix (`senior-sales-3f9a2c`, or `role-3f9a2c` for a name like "बिक्री"). Keys never equal Better Auth's
  built-in role names (`owner`, `admin`, `member`). Names are unique per organization among live roles, ignoring
  case.
- **Keys are never reused,** even after a role is deleted (a plain unique index on `(organization_id, key)`).
  `member.role` holds the key with no foreign key (it is Better Auth's column), so a reused key would hand a later
  role to anyone still on the deleted one.
- **A role with staff cannot be deleted** (`ROLE_IN_USE`). Deleting is a soft delete (ADR 0004).
- **Giving a role holds it.** Adding someone or changing their role takes the role row `FOR SHARE` in the same
  transaction as the checks and the write; editing or deleting a role takes it `FOR UPDATE`. So nobody lands on a
  role deleted meanwhile (`ROLE_NOT_FOUND`), or on one widened past what the giver holds (`EXCEEDS_YOUR_PERMISSIONS`).
  A member left on a deleted role anyway (set by hand, say) keeps no permissions until they are given another role,
  and can still be moved, reset or removed: those checks read the deleted role, whose permission rows remain.

## Starter roles (for the product owner to review)

Every new organization gets these five (`packages/domain/src/identity/starter-roles.ts`).

| Role       | Key          | Allows                                                                                                                                                                                                                                         |
| ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner      | `org-owner`  | Everything, always, including permissions added later                                                                                                                                                                                          |
| Admin      | `org-admin`  | Everything except `roles:manage`: staff, settings, audit log, margins, and every module over all records. Settings: an Admin may switch the two-factor requirement on, but only an Owner switches it off (spec 6.2: "an owner can require" it) |
| Sales      | `sales`      | Leads (own records): view, create, edit. Quotes (own): view, create, edit. Bookings (own): view, create. Departures and suppliers: view                                                                                                        |
| Operations | `operations` | Quotes and bookings (all records): view; bookings: edit. Departures and suppliers: view, create, edit                                                                                                                                          |
| Accounts   | `accounts`   | Accounts: view, create, edit. Margins. Quotes and bookings (all records): view. Suppliers: view                                                                                                                                                |

## Context

- **Why not Better Auth's dynamic access control.** It stores a role's permissions as a JSON string in
  `organization_role`, checked by its own endpoints; it has no notion of `own`/`all` scope; and its tables would sit
  outside row-level security. Its built-in `owner`/`admin` roles also grant powers on Better Auth's organization
  endpoints. We block those endpoints (`/api/auth/organization/*` returns 404) and manage members through our API.
- **Checked on every request.** `orgProcedure` reads the member's role and permissions from the database (inside
  `forOrg`), so a role change applies to the next request, not when the 5-minute session cookie expires.

## Consequences

- Adding a module means adding its permissions to the catalog. Owners get them at once; other roles, including the
  starter roles of existing organizations, must be given them.
- Plan 4's plan entitlements (request check 3) map each permission's module (`moduleOf`) to a plan module, inside
  `requires()`, so no procedure changes.
