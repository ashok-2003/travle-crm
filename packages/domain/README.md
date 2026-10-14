# @travel-crm/domain

Business rules, one folder per module (spec section 8). A module's public API is its `index.ts`, imported as
`@travel-crm/domain/<module>`. Inside a module, import its own files freely; across modules, only the other module's
`index.ts`. dependency-cruiser enforces both.

| Module     | What it holds                                                                         |
| ---------- | ------------------------------------------------------------------------------------- |
| `kernel`   | building blocks every module uses: `DomainError`                                      |
| `identity` | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md)) |

Business rule failures throw `DomainError(code, reason, message)`; the API turns the code into an HTTP status and passes
the reason to the web app.
