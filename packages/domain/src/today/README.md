# today

The signed-in person's day (spec 3.5, R35), read-only, at the top of the business modules' layers: it composes the
public queries of crm and tasks below it, and later releases add their own items.

## Public functions (`index.ts`)

- `todaySummary(tx, access, now)`: today's date in the agency's zone, the counts of overdue items, payments due, new
  leads waiting, opened quotes with no reply and items due today, and the first of each section.
- `todaySection(tx, access, { section, after?, limit }, now)`: one section (`overdue`, `payments-due`, `new-leads`,
  `quote-opened`, `due-today`, in that order on screen), a page at a time. The two sections of release 5 are the sales
  module's queries (`sales/today-work.ts`): a quote opened over a day ago with no reply, note, call or quote change
  since (Done marks the opens seen), and the unpaid instalments of accepted quotes due within the agency's reminder days
  or missed.
- `runMorningPush(dependencies, now)` (`today.morning-push`, every 15 minutes): for each agency, people with a phone
  registered for push whose chosen time (default 09:00, in the agency's zone) has come, at most two hours ago, and who
  have not had today's get "8 things today, 2 overdue" (counts only, nothing when there is nothing to do). The day is
  stamped on the person's `morning_push_setting` in the transaction that notifies, and the notification's source is a
  key of the person and the day, so a repeat sends nothing. Agencies whose subscription locks staff out get none.

Both need `leads:view` (the api checks) and show the person's own items, whatever their scope. Overdue is open work
due before now; due today runs from now to the agency's next midnight (`organizationTimeZone`), so at 00:05
yesterday's undone follow-up is overdue and at 23:50 one due at 00:10 is not today's. New leads are the person's
leads in New, oldest first (crm's `newLeadsWaiting`, over `lead_new_by_owner`); each task on a lead brings the lead in
brief (crm's `leadBriefs`), unless it is a lead the person's scope doesn't reach. Every section pages by the last
item's id, never by offset.
