# @travel-crm/api

The tRPC routers. Routers are thin: validate with `@travel-crm/contracts`, run the request checks, call the domain.
The web app imports the `AppRouter` type only.

## Procedure builders (`src/procedures.ts`)

| Builder                              | Checks (spec 6.5)                                              | Use for                                    |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------ |
| `publicProcedure`                    | none                                                           | nothing yet                                |
| `protectedProcedure`                 | 1, from the 5-minute session cookie                            | `me.get`                                   |
| `orgProcedure`, `.requires("x:y")`   | 1, membership and pending steps read from the database, then 4 | organization data                          |
| `freshProcedure`, `.requires("x:y")` | the same, with the session itself read from the database       | money, roles, exports, staff, 2FA settings |
| `platformProcedure`                  | 1 from the database, user role `admin`, no membership          | the platform console                       |

Checks 2 (organization active) and 3 (module on the plan) arrive in plan 4 inside these builders, so procedures don't
change. Check 5 (own or all records) is the handler's job, with `scopeFilter()` from `@travel-crm/domain/identity`.

## Errors

A `DomainError` becomes the matching tRPC status (`NOT_FOUND` 404, `FORBIDDEN` 403, `CONFLICT` 409, `VALIDATION` 400,
`LIMIT_REACHED` and `FEATURE_LOCKED` 403). The response's `error.data` carries `domainCode` and `reason` for the web
app's translated message. Unexpected errors say only "Something went wrong".

## Routers

`me`, `staff`, `roles`, `settings`, `platform`. Add a router in `src/routers/` and list it in `app-router.ts`.
