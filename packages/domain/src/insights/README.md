# insights

The dashboard's figures (release B, `docs/proposals/2026-10-21-ayush-proposals.md`): how the leads
did over a period in the agency's time zone, for the person's own leads or, with `leads:view` "all", the agency's.

- It sits above `crm` and `tasks` (dependency-cruiser's `business-modules-call-down`), like `today`, and only reads.
- `crm/lead-insights.ts` holds the lead queries; this module picks the period and the scope and adds the overdue work.
- The queries are live counts under row-level security. If they miss their time budget at the seeded size (500 staff),
  a summary table kept by the leads' events takes over (ADR 0028).
- A period's new leads are its cohort: contacted, won and the funnel describe them as they are now; Quote sent and Won
  in the period are moves the timeline recorded during it, whichever lead made them.
