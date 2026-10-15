# @travel-crm/api

The tRPC routers. Routers are thin: validate with `@travel-crm/contracts`, run the request checks, call the domain.
The web app imports the `AppRouter` type only, and the console screens the `PlatformRouter` type.

## Procedure builders (`src/procedures.ts`)

| Builder                              | Checks (spec 6.5)                                              | Use for                                    |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------ |
| `publicProcedure`                    | none                                                           | nothing yet                                |
| `protectedProcedure`                 | 1, from the 5-minute session cookie                            | `me.get`                                   |
| `orgProcedure`, `.requires("x:y")`   | 1, membership and pending steps read from the database, then 4 | organization data                          |
| `freshProcedure`, `.requires("x:y")` | the same, with the session itself read from the database       | money, roles, exports, staff, 2FA settings |

Checks 2 (organization active) and 3 (module on the plan) arrive in plan 4 inside these builders, so procedures don't
change. Check 5 (own or all records) is the handler's job, with `scopeFilter()` from `@travel-crm/domain/identity`.

## Errors

A `DomainError` becomes the matching tRPC status (`NOT_FOUND` 404, `FORBIDDEN` 403, `CONFLICT` 409, `VALIDATION` 400,
`LIMIT_REACHED` and `FEATURE_LOCKED` 403). The response's `error.data` carries `domainCode` and `reason` for the web
app's translated message. Unexpected errors say only "Something went wrong".

## Routers

`me`, `staff`, `roles`, `settings`. Add a router in `src/routers/` and list it in `app-router.ts`.

## The platform console (`src/platform/`)

The console's routers are served apart, at `/api/platform/trpc`, by the console process: the only one that holds
`DATABASE_PLATFORM_URL` (ADR 0018). They have their own tRPC instance (`platformT`), context
(`createPlatformContext(services, request, resHeaders)`, which always reads the session from the database) and
builders:

| Builder               | Checks                                                                                | Use for                                   |
| --------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| `staffProcedure`      | signed in, platform staff of either level (no membership ever), no temporary password | everything support does                   |
| `superAdminProcedure` | the same, and the super-admin level                                                   | plans, platform staff, permanent deletion |

`platformRouter` (`src/platform/platform-router.ts`) lists them: `whoAmI`, `log.list`.
