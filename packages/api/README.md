# @travel-crm/api

The tRPC routers. Routers are thin: validate with `@travel-crm/contracts`, run the request checks, call the domain.
The web app imports the `AppRouter` type only, and the console screens the `PlatformRouter` type.

## Procedure builders (`src/procedures.ts`)

| Builder                              | Checks (spec 6.5)                                                                | Use for                                    |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------ |
| `publicProcedure`                    | none                                                                             | nothing yet                                |
| `protectedProcedure`                 | 1, from the 5-minute session cookie (an impersonation session from the database) | `me.get`                                   |
| `orgProcedure`, `.requires("x:y")`   | 1, membership and pending steps read from the database, then 2, 3 and 4          | organization data                          |
| `freshProcedure`, `.requires("x:y")` | the same, with the session itself read from the database                         | money, roles, exports, staff, 2FA settings |

Check 2 (organization active) reads the organization's subscription with the member, and refuses by what the call
does: a query views, a mutation changes. A procedure that exports data says so with `.meta({ lifecycle: "export" })`
(allowed while read-only, and to the Owner while suspended); one every state must allow, so the app can say why the
rest is refused, with `.meta({ lifecycle: "always" })`. Check 3 (module on the plan) comes from each required
permission's module, inside `requires()`, before check 4. Check 5 (own or all records) is the handler's job, with
`scopeFilter()` from `@travel-crm/domain/identity`. Support's impersonation session is always read from the database,
and its admin re-checked, so it ends the moment the session does, not when the cookie cache expires.

## Errors

A `DomainError` becomes the matching tRPC status (`NOT_FOUND` 404, `FORBIDDEN` 403, `CONFLICT` 409, `VALIDATION` 400,
`LIMIT_REACHED` and `FEATURE_LOCKED` 403). The response's `error.data` carries `domainCode` and `reason` for the web
app's translated message. Unexpected errors say only "Something went wrong".

## Routers

`me`, `staff`, `roles`, `settings`, `subscription` (`get`: what the organization's subscription allows today, in
every state), `profile` (`get`, `save`, `checklist`: the business profile and the setup checklist, all three needing
`settings:manage`). Add a router in `src/routers/` and list it in `app-router.ts`.

## The platform console (`src/platform/`)

The console's routers are served apart, at `/api/platform/trpc`, by the console process: the only one that holds
`DATABASE_PLATFORM_URL` (ADR 0018). They have their own tRPC instance (`platformT`), context
(`createPlatformContext(services, request, resHeaders)`, which always reads the session from the database) and
builders:

| Builder               | Checks                                                                                | Use for                                   |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| `staffProcedure`      | signed in, platform staff of either level (no membership ever), no temporary password | everything support does                   |
| `superAdminProcedure` | the same, and the super-admin level                                                   | plans, platform staff, permanent deletion |

`platformRouter` (`src/platform/platform-router.ts`) lists them, the routers in `src/platform/routers/`:

| Router           | Procedures                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| (top level)      | `whoAmI`                                                                                                                  |
| `dashboard`      | `organizations`: every organization's status, plan, days left, seats, storage and this month's use                        |
| `organizations`  | `onboard`, `get`, `update`, `resendInvite`                                                                                |
| `plans`          | `list`, `policy`; super admins: `create`, `update`, `archive`, `setPolicy`                                                |
| `subscriptions`  | `get`, `changePlan`, `setOverrides`, `setTrialEnd`, `setPaidThrough`, `recordPayment`, `voidPayment`, `suspend`, `cancel` |
| `dataProtection` | super admins: `exportOrganization`, `requestPurge`, `exportSubject`, `requestErasure`                                     |
| `jobs`           | `failed`, `retry`, `schedules`; super admins: `unschedule`                                                                |
| `log`            | `list`: the platform log, newest first, or one organization's                                                             |
