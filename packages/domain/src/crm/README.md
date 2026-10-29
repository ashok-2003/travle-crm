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
  (R31). The caller checks who may make the change. Both hold the lead with `lockLead`, which Reopen and a new
  follow-up use too: `FOR NO KEY UPDATE`, never `FOR UPDATE`, which would block the `KEY SHARE` every row pointing at
  the lead takes as it is inserted, and deadlock with a Done that changed the task first.
- `crm-audit.ts`: `recordCrmAudit(tx, actor, change)`, with every action crm records, by record kind: `person.*`,
  `lead.*` and `blocked-contact.*`. Snapshots never hold note text, task titles or a blocked contact's value (R28).
- `lead-events.ts`: `recordLeadEvent(tx, actor, entry)`, one timeline entry. The api writes "follow-up done" through
  it when a lead's task is done (R22).
- `destination-merges.ts`: `mergeDestinations(tx, actor, input)`, catalog's merge plus moving the leads and repeat
  enquiries; returns `{ leadsMoved }`.

## Assigning leads that arrive by themselves (release 4)

- `assignment/choose-owner.ts`: `chooseOwner(tx, lead, context)` answers `{ userId, reason, rulePosition, away }`: a
  returning customer's previous owner, then the first matching rule, then the agency's mode (the Owner, the pool in
  turn, or the pool member with the fewest open leads), else nobody (Unassigned). Only the turns skip a person who is
  away; a previous owner or a rule's person gets the lead and the answer says they are away. The pool rows are locked
  in `id` order and the turn is stamped by the database's clock. `saveEnquiry` passes the reason to `addLeadInTransaction`,
  which keeps it on the lead's creation audit entry and its "created" timeline entry.
- `assignment/settings.ts`: the settings read and saved whole (mode, reply time, working hours, rules, pool; audited with
  the full detail by `assignment-audit.ts`), and the away switch (`assignment.away-set`).
- `first-reply-alert.ts`: on `lead.created`, a check queued for the reply time counted in working minutes
  (`addWorkingMinutes`, kernel); at the due instant a lead still New with no reply tells everyone holding `leads:assign`
  (`identity.membersHolding`) once. `unassigned-notice.ts` tells them of a lead nobody could take (`lead.unassigned`).
  `departing-member.ts` also takes the leaver out of the pool.

## People and adding leads

- `people.ts`: a person found again by their phone, else their email, else their Instagram handle (R4), each exactly,
  among live people (`matchPerson`); `addPerson`, `fillMissingContacts` (a contact another person holds is dropped,
  R32) and `recordPersonEdit`, each audited as `person.*` with the changed fields only (`changed-fields.ts`).
- `known-contact.ts`: `findKnownContact`, who a phone, email or handle belongs to, with their newest open lead (its
  destination and owner only) and whether the contact is blocked: what the form says before saving.
- `create-lead.ts` and `repeat-enquiry.ts`: `createLead`, a new person or a known one; on their open lead a repeat
  enquiry kept as asked (R8, "Repeat enquiry on your lead" to its owner), or a new trip enquiry marked returning.
- `trip-columns.ts`: the one trip mapping, for the lead, a repeat enquiry, the list, the lead page, Today and the
  export: `resolveTrip` (the destination found or added), `tripColumns`, `travelWhenOf`, `tripSummaryOf`,
  `tripDetailOf`.

## The list, the lead page and its changes

- `lead-list.ts` and `lead-list-query.ts`: `listLeads` and `countLeads`, a salesperson's own leads whatever they ask
  for (`scopeFilter`), a manager's own or everyone's, by stage, owner, source, destination and trip type, and a
  search by name (trigram word similarity) or by four or more digits of a phone; keyset pages, newest first; the SQL
  is composable (R11), so the performance tests `EXPLAIN` exactly what runs.
- `lead-detail.ts`: `getLead`, and `findLeadInScope` (`assertRecordInScope`; a lead out of scope is `NOT_FOUND`), which
  every change on a lead starts with.
- `timeline.ts`: `listLeadTimeline`, newest first, each entry with the note, repeat enquiry or task it points to (the
  tasks through the tasks module's `listTasksOnRecord`); `addLeadNote`, audited without its text (R28).
- `calls.ts` (release 5): `logCall` (a call written up with its outcome, a note and, if asked, the next follow-up, in
  one transaction under the lead's lock; Spoke on a New lead moves it to Contacted), `editCall` and `deleteCall` (soft;
  by who wrote it in the first day, `CALL_EDIT_HOURS`, and by `leads:assign` at any time), `callTargetOf` and
  `sendCallToMyPhone` (notify() the person's own device, "Call {name}" linking to `/call/<lead>`; no number in the push;
  needs a registered device; rate limited through the limiter the router passes). A call's note is never copied into the
  audit log or the `lead.call-logged` event.
- `stage-changes.ts`: `moveLeadStage`, `reopenLead` (under the row's lock, to the open stage it left, R30) and
  `reassignLead`, through `lead-core.ts`.
- `lead-edits.ts`: `editLeadTrip` (replaced whole, "trip edited" on the timeline) and `editLeadPerson`
  (`CONTACT_ON_ANOTHER_PERSON` for a contact another person holds).
- `lead-work.ts`: `addLeadWork`, a follow-up or task on the lead, always its owner's (R21, read under the lead's lock),
  at a time on the agency's clock, never in the past.
- `blocking.ts`: `blockLeadContact` (the phone, else the email, else the handle, and the lead becomes Not a lead,
  R33), `addBlockedContact`, `listBlockedContacts`, `unblockContact`, `isBlocked`.

## Today, a member leaving, erasure and the demo

- `work-queries.ts`: what Today reads: `newLeadsWaitingQuery` and `newLeadsWaiting` (one person's leads still in New,
  oldest first), `countNewLeadsWaiting`, and `leadBriefs` (a lead's name and trip line for Today's rows, for leads in
  the member's scope only).
- `departing-member.ts`: `handOverDepartingMemberListener` on `staff.removed` (`crm.hand-over-departing-member`): the
  leaver's open leads, then their closed leads that still hold open work, then their standalone tasks go to the first
  Owner, 50 in a locked batch, until a batch selects none; the system's change, telling nobody (R27, R37).
- `customer-erasure.ts`: `exportCustomer` (in the organization's transaction: the person, their leads with trips,
  notes, calls, enquiries and tasks) and `eraseCustomer` (on the platform's transaction; `platform/erase-customer.ts` runs
  it with the leads' tasks, notifications and files).
- `demo-leads.ts` and `demo-lead-data.ts`: `addDemoLeads`, the demo agency's destinations, people and leads, built
  through the same cores the screens use, inside the nightly reset.
