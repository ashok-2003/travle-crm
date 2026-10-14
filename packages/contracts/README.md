# @travel-crm/contracts

Zod schemas for every API input and output, one subpath per module: `@travel-crm/contracts/identity`.
The API validates inputs and outputs with them, and the web app can reuse them for its forms.

Shared field rules (organization codes, usernames, emails, passwords, role keys) are in `src/identity/fields.ts`.
Output schemas refuse placeholder (`.invalid`) email addresses, so one can never be shown by mistake.
