# 0028: Data rules for the business modules

Date: 2026-10-16 · Status: accepted · Applies to Phase 1 steps 2-7 (CRM, catalog and quotes, bookings and departures,
suppliers, accounts, reports)

## Decision

The Foundation's rules stay as they are: `organization_id` and row-level security on every organization table, keys
and unique constraints that include `organization_id`, UUID v7 ids, soft delete with partial unique indexes, CHECK
constraints for allowed values, money in paise, times in UTC, the outbox in the change's transaction. The business
modules add these.

### Normalise facts, snapshot agreements, aggregate for reading

- **Facts live in one place.** A person is one row per organization (matched by phone number in E.164, unique among
  live rows); each trip enquiry is a lead that points to that person. Destinations, suppliers, hotels, room types and
  rates are catalog rows that quotes and templates refer to, never copy.
- **Agreements are snapshots.** When a quote is sent, each quote line copies the selling price and cost it was sent
  with; a booking copies what was accepted; receipts and payments record what was paid. A catalog change never moves a
  sent quote's price. Staff see "Rates have changed since this was sent" and may reprice on purpose.
- **Reports read summary tables, not raw rows.** Counts and totals for charts (leads per day by source and owner,
  bookings and revenue by source, overdue payments) live in summary tables, each with `organization_id` and row-level
  security, kept up to date by listeners keyed on the event id, so a repeated event changes nothing.
  **No materialized views:** Postgres applies no row-level security to them, so they would show every organization's
  rows.

### Postgres techniques the modules use

- **Partial indexes for the hot subsets**, led by `organization_id`: open leads, leads with no first reply, unpaid
  payment instalments, follow-ups not done, live (not deleted) rows. Today's work list is a handful of these small
  indexed queries, not one wide one.
- **Keyset pagination** for every long list (leads, the inbox, messages, the timeline): `WHERE id < :last ORDER BY id
DESC` on UUID v7, which sorts by creation time. Never `OFFSET`.
- **Non-overlapping hotel seasons are enforced by the database.** Rates keep `valid_from` and `valid_to` as plain date
  columns (easy for Prisma), and the migration adds an exclusion constraint on
  `daterange(valid_from, valid_to, '[]')` with `&&`, together with the organization, room type, meal plan and
  occupancy compared with `=` (the `btree_gist` extension), among live rows. "The rate for a stay on 15 December" is
  then one indexed lookup.
- **Fuzzy search with trigrams.** Names, destination aliases and hotel names get a `pg_trgm` GIN index, so "Rahul
  Shrma" or "Kedar" still match. Phone lookup is exact, on `(organization_id, phone_e164)`.
- **AI-suggested values sit in their real column**, so filters and assignment rules can use them, with the field
  listed in the row's `suggested_fields` until staff confirm it. A provenance table keyed by record and field keeps
  where each value came from (a message, a recording) and the exact excerpt.
- **The lead timeline is an index, not the source of truth**: one slim row per event (kind, time, actor, the record
  it points to) over the typed tables (calls, messages, quotes, payments).
- **`jsonb` only for payloads kept as received**: raw WhatsApp webhooks and the AI's raw output. Anything a query
  filters, joins or sorts on is a real column.
- **Travel dates are `date`** (`CalendarDate` in the kernel); moments are `timestamptz`.

### Money that can grow is `BigInt`

The existing money columns are 32-bit `Int` paise, which caps an amount at about ₹2.14 crore. That suits plan prices,
but a group or corporate booking total, a ledger balance or a summary total can pass it. New money columns for
amounts that can grow (quote and booking totals, payments, balances, summary totals) are `BigInt` paise, converted to
the kernel's `Money` at the module's edge.

### Performance is tested, not hoped for

A seeded test database holds one large agency (about 50,000 leads, 1,000,000 messages, 500 staff). The busiest
queries (Today, the inbox, the lead list, the quote page) have time budgets, and a test reads their query plans and
fails when one stops using its index.

## Context

The Foundation (plans 1-5) built the isolation, keys, soft delete and shared services. The business modules bring the
volume: years of WhatsApp messages, every view of every quote, agencies with hundreds of staff, reports over all of
it. The feature decisions behind these modules are in the Phase 1 scope the owner approved on 2026-10-16
(leads from everywhere, assignment rules, templates, quote pages and alerts, payments by UPI, the trip page, the AI
features and the rest).

## Consequences

- Migrations add the `pg_trgm` and `btree_gist` extensions (created by `app_migrator`, in `sql/bootstrap.sql` for
  local and test databases).
- Exclusion constraints and trigram indexes Prisma can't express are written into the migration's SQL by hand, and
  the schema-drift test must keep passing.
- Summary tables lag a change by the time the worker takes to run the listener (seconds). Screens that must be exact
  at once (a payment just recorded) read the source rows.
- Snapshots mean a sent quote and a confirmed booking never change by themselves; repricing is always a staff action
  that the audit log records.
- `BigInt` columns come back from Prisma as `bigint`; contracts carry money as the kernel's `Money` (a safe integer),
  so the conversion checks its range at the edge.
- The large seeded agency makes the test suite slower; it runs in the performance tests' own database
  (`createIsolatedDatabase`), not in every package's tests.
