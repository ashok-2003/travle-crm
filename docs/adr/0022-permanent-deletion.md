# 0022: Permanent deletion: purging an organization, erasing one person

Date: 2026-10-16 · Status: accepted · Implements spec section 5 ("permanent deletion happens only through a
super-admin action in the platform console")

## Decision

- **Each module deletes what it owns**, through a function the platform's jobs call in a platform transaction, so no
  module reaches another's tables:
  - files: `queueOrganizationFileDeletion` (a purge) and `deleteRecordFiles` (an erasure) delete the rows and queue
    their stored bytes in the deletions' outbox, in the same transaction (below). A system-owned record's files (an
    issued document's PDF) go only with their record, in a whole-organization purge;
  - audit: `redactAuditEntries` replaces one record's snapshots with `{ "redacted": true }` through the platform role's
    column grant (ADR 0015), keeping who did what and when;
  - notifications: `forgetRecipient` deletes a person's notifications, opt-outs and push subscriptions;
    `forgetRecordNotifications` deletes the notifications about a record: those whose link names it (a notification
    about a record links to it, `/travellers/<id>`), and those an event about it caused;
  - share links: `forgetRecordShareLinks` deletes a record's links (their labels name what was shared) with every open
    recorded against them (the visitor's network and browser), and names the `share-link.opened` events of those
    opens, whose notifications quote the label;
  - identity: `erasePerson` clears a removed person's name, addresses and every way to sign in, keeping the user's id,
    and `deleteUsers` deletes an organization's people (ADR 0021's module).
- **Stored files go through an outbox, by id only.** The transaction that deletes the rows writes
  `stored_file_deletion` rows (a platform table: no `organization_id`, so the purge's catalog walk leaves it, and no
  rights for the runtime role): the organization's id and the attachment's id, or no attachment for the organization's
  whole folder. The storage key is made from them (`organizations/<organization>/attachments/<attachment>`, ADR 0011),
  so no file name is kept. Once the transaction commits, the job deletes what is due at once, then each row; a failure
  there is logged as one ids-only line, not thrown. Whatever is left (a storage error, a restart, a later sweep) goes
  to `platform.delete-stored-files`, the console's job. Its data names the organization, and each run covers that
  organization alone: it deletes the due files, each then its row, and is retried for about a day (30 retries, up to
  an hour apart) before the failed-jobs list, where a retry starts it again. After a run, it queues the next for the
  organization's earliest row left, to start when that row is due. The job's id is made from the organization and that
  time, so the purge's own send and the follow-up for one row are one job.
- **The hourly sweep is required.** A run pg-boss starts early (the clocks a minute or more apart) finds its row not
  yet due, and its follow-up is ignored: that job id is its own, still running. Such a row waits for the hourly sweep
  (`platform.sweep-stored-files`, the console's schedule), one pass over every organization's due rows, which also
  catches rows whose job was lost (a crash before the send) or ran out of retries. Nothing reaches storage inside a
  transaction, and nothing is forgotten after one.
- **A purge sweeps its organization's folder, not its keys.** It queues the folder (`deletePrefix`, which lists and
  deletes 1,000 keys a request, so a large organization takes one request per thousand files, not one per file) twice:
  once at once, and again 15 minutes later (`LATE_WRITES_MS`), when every upload link handed out before the purge has
  lapsed (10 minutes) and a render under way has stored its file. The folder catches what no row names: a late upload,
  a PDF stored as the purge ran, an object a past failure left. A purge job run again for an organization already gone
  queues the folder again. An erasure queues one row per attachment of its record: the rest of the folder is someone
  else's.
- **Whole organizations from the catalog.** `deleteOrganizationRows` (`@travel-crm/db/platform`) finds every table
  with `organization_id` in the database's catalog, deletes the organization's rows in an order no foreign key trips
  over (`audit_entry` first, as its key restricts), then the organization. A later module's table needs no change
  here. The organization's export reads the same tables from the catalog (all but the outbox, processed events and
  push subscriptions), a page at a time.
- **Webhook events become tombstones.** The worker keeps each event with the organization its handler found
  (`resolved_organization_id`, reported by `processing.isAbout`, which takes only a UUID), whether the handler then
  succeeded or failed. A tombstone blanks the payload and headers and keeps the provider's id, so a replayed event is
  still ignored (ADR 0013's consequence), and a retry of a tombstoned event runs no handler.
  - A purge blanks all of the organization's events, those still in flight too (its `webhooksWaiting` counts them): no
    handler can use an event about an organization that is gone. Its later folder sweep blanks again any event a
    handler found since (a retry that failed on the missing organization).
  - An erasure blanks every processed event of the organization, not only the person's: the intake can't tell which
    payloads quote them, and a processed payload has no further use. It leaves events in flight to their handler (a
    payment still to record) and counts them as `webhooksWaiting`; they keep their payload until the next erasure in
    the organization or ADR 0013's retention sweep.
- **Erasure is for records of people.** A record subject must be on the list of types that hold a person's data
  (today the traveller, as spec 5 says; a module adds its own type with its erasure step), or it is refused
  (`VALIDATION`/`NOT_PERSONAL_DATA`) when asked and again in the job. An issued document is refused
  (`VALIDATION`/`KEPT_BY_LAW`): it is a GST invoice or its like, kept as issued (ADR 0012), and DPDP allows the
  retention a law requires. It keeps the customer's details as they were; the erasure covers the person's own records.
- **Exports first.** An organization's export is a console job (`platform.export-organization`, given two hours): it
  reads every organization table through `app_export_organization_rows`, a page per short transaction stepped into
  the organization, and stores JSON-lines parts and a copy of each stored file under
  `platform/exports/<organization>/<export>/`, ids only in the keys. `platform_export` keeps it for 7 days; a download
  hands out 15-minute links and is logged (`organization.export-downloaded`); `platform.expire-exports` then deletes
  its parts and copies. `organization.exported` is written only once the export is complete. A subject's export
  (`exportedFiles` and `auditEntriesAbout`) is returned at once in the console's response, its file links lasting 15
  minutes, and only logged. A purge needs a fresh export
  (`hasFreshExport`): one done within the last day and not withdrawn since. An erasure withdraws every export of its
  organization, though their `organization.exported` log entries stay, so a purge after it needs a new export, without
  the erased person. An erasure needs the subject's `subject.exported` platform log entry from the last day: a subject
  export is handed over in the console's response, not stored, so nothing withdraws it. Both are matched on the
  organization, so one organization's export never counts for another.
- **The runtime role can't do any of it.** It has no right to delete attachments, notifications or share links, to
  change audit entries, or to touch the outbox; each of these functions fails with "permission denied" outside a
  platform transaction. Reads that rely on row-level security (`auditEntriesSince`, `documentsIssuedSince`) refuse to
  run as the platform role, and `auditEntriesAbout` filters by the record's organization.

- **The console's steps, as spec 5 lists them.** A super admin exports (the organization's tables, people and files,
  or one subject's data), types the organization's code, and the console queues a job, once the request is recorded:
  `platform.purge-organization` for a cancelled organization, `platform.erase-subject` for a removed member or one
  record. The job runs everything in one platform transaction (the purge allows ten minutes) and records
  `organization.purged` or `subject.erased` in the platform log under the super admin who asked; an erasure also
  records `subject.erased`, without personal data, in the organization's own log.
- **The purge job checks everything again,** under the subscription's lock, which every subscription change takes: the
  organization is cancelled by its lifecycle as of today (`entitlementsOf`, in its own time zone), and it has a fresh
  export when the job runs (under a day old, and not withdrawn by an erasure since the request). Otherwise it keeps
  the organization and records `organization.purge-skipped` with the reason (`not-cancelled` with the status, or
  `no-recent-export`); a super admin asks again, which checks everything again. A payment recorded during a purge
  waits for it, then finds the organization gone. The nightly demo reset purges its own active demo with none of
  these checks.
- **The erasure job checks again too:** its organization still exists, and the subject's export is less than a day old
  when the job runs. Otherwise nothing is erased, and `subject.erasure-skipped` gives the reason
  (`organization-gone` or `no-recent-export`).
- **Re-checks read on the platform transaction itself,** never inside an `asOrganization` step: a step sees only its
  organization, so a check made there could find too little and let a deletion through.
- **An erasure expires the organization's stored exports** at once
  (`expireOrganizationExports(services, tx, organizationId, "erasure")`, after its deletes, in its transaction, which
  marks them expired and logs it; their files go in a sweep it queues): an export is kept for 7 days and would
  otherwise keep the erased person. A purge leaves them (see Consequences).
- **Both jobs are safe to run again.** A purge of an organization already gone sweeps its folder again. An erasure
  job carries its request's id, recorded in its `subject.erased` entry: a run repeating a finished one (pg-boss runs a
  job at least once) changes and records nothing more, and only finishes the files.

## Context

- **Why an outbox, not deletes after the commit.** The bytes can't be deleted inside the transaction: if it rolled
  back, the rows would point at nothing. Deleted after it, they were deleted once: a storage error, a crash or a
  deploy after the commit left them stored for good, with nothing left naming them (the rows were gone, and a rerun
  found nothing). The outbox is written with the rows, so the deletion exists exactly when the commit does, and stays
  until storage confirms it.
- **Why redact rather than delete audit entries.** The log says that something happened, by whom and when; erasure
  removes what it says about the person, and nothing else.

## Consequences

- **A deliberate window after a purge:** the organization's exports stay under `platform/exports/<organization>/`
  for up to 7 days, then expire. That is what exporting before a purge is for: the agency takes its data away after
  it is gone. The purge's sweep covers `organizations/<organization>/` only. An erasure is different: it expires them
  at once.
- An organization's queued, retrying and archived pg-boss jobs outlive its purge until pg-boss's own retention
  removes them. They hold ids only (spec 9.1); a queued one runs against an organization that no longer exists and
  finds nothing to do.
- An email or a push about an erased record that was already sent stays sent; only the bell's copy goes.
- A webhook event a handler never resolves to an organization can't be found by a purge; ADR 0013's retention sweep
  blanks it.
- Later modules (CRM's travellers) add their own step to erasure, as these do, and their record type to the list.
- A legal or deletion hold, keeping an organization or a person from deletion while one applies, is a later feature.
- Deployment: the bucket must be unversioned, or expire noncurrent versions (ADR 0011): "for good" holds only then.
