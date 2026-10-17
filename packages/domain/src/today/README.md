# today

The signed-in person's day (spec 3.5, R35), read-only, at the top of the business modules' layers: it composes the
public queries of crm and tasks below it, and later releases add their own items.

## Public functions (`index.ts`)

- `todaySummary(tx, access, now)`: today's date in the agency's zone, the counts of overdue items, new leads waiting
  and items due today, and the top three (the first overdue, the oldest new lead, the next due today).
- `todaySection(tx, access, { section, after?, limit }, now)`: one section (`overdue`, `new-leads`, `due-today`), a
  page at a time.

Both need `leads:view` (the api checks) and show the person's own items, whatever their scope. Overdue is open work
due before now; due today runs from now to the agency's next midnight (`organizationTimeZone`), so at 00:05
yesterday's undone follow-up is overdue and at 23:50 one due at 00:10 is not today's. New leads are the person's
leads in New, oldest first (crm's `newLeadsWaiting`, over `lead_new_by_owner`); each task on a lead brings the lead in
brief (crm's `leadBriefs`). Every section pages by the last item's id, never by offset.
