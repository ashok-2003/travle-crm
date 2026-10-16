# crm

People, leads, the lead timeline and blocked contacts (release 1, spec 3-5; layer L1). It may call catalog and tasks
below it, never today above it (`business-modules-call-down`).

## Shared pieces every crm change uses

- `lead-core.ts` (P9): `changeLeadStage(tx, actor, { leadId, stage }, now)` and
  `changeLeadOwner(tx, actor, { leadId, ownerUserId })` do the whole change: the row (the open stage it left for
  Reopen, R30; the first reply, spec 4), the lead's open tasks (cancelled on Lost and Not a lead, R29; moved with the
  owner, R21), the timeline entry, the audit entry (`lead.stage-changed`, or `lead.reopened` for a closed lead moved to
  an open stage; `lead.reassigned`), the event, and "New lead assigned to you" when a person, not the system, makes
  someone else the owner (`notifyLeadAssigned`, R27). Each returns false and records nothing when nothing changes
  (R31). The caller checks who may make the change.
- `crm-audit.ts`: `recordCrmAudit(tx, actor, change)`, with every action crm records, by record kind: `person.*`,
  `lead.*` and `blocked-contact.*`. Snapshots never hold note text, task titles or a blocked contact's value (R28).
- `lead-events.ts`: `recordLeadEvent(tx, actor, entry)`, one timeline entry. The api writes "follow-up done" through
  it when a lead's task is done (R22).
- `destination-merges.ts`: `mergeDestinations(tx, actor, input)`, catalog's merge plus moving the leads and repeat
  enquiries; returns `{ leadsMoved }`.

The lead list, the lead page, adding leads, blocking, Today's queries, the departing member's hand-over, erasure and
the demo's leads are added by release 1's tracks C and S.
