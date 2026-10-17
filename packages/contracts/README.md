# @travel-crm/contracts

Zod schemas for every API input and output, one subpath per module: `@travel-crm/contracts/identity`.
The API validates inputs and outputs with them, and the web app can reuse them for its forms.

Shared field rules (organization codes, usernames, emails, passwords, role keys) are in `src/identity/fields.ts`.
Output schemas refuse placeholder (`.invalid`) email addresses, so one can never be shown by mistake.

Release 1's modules: `crm` (people, leads, the lead timeline, blocked contacts; the fixed lists of stages, trip types,
hotel categories, food and sources in `src/crm/fields.ts`), `catalog` (destinations), `tasks` (follow-ups and tasks)
and `today`. A time someone picks travels as `wallClockTime` (`{ on: "2026-10-17", at: "16:00" }`, from
`@travel-crm/contracts/kernel`) on the agency's clock; the server turns it into an instant in the agency's zone.
