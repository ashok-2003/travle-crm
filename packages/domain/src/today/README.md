# today

The signed-in person's day (spec 3.5, R35), read-only, at the top of the business modules' layers: it composes the
public queries of crm and tasks below it, and later releases add their own items.

## Public functions (`index.ts`)

- `todaySummary(tx, access, now)`: today's date in the agency's zone, the counts of overdue items, new leads waiting
  and items due today, and the top three (the first overdue, the oldest new lead, the next due today).
- `todaySection(tx, access, { section, after?, limit }, now)`: one section (`overdue`, `new-leads`, `due-today`), a
  page at a time.

Both need `leads:view` (the api checks) and show the person's own items, whatever their scope.
