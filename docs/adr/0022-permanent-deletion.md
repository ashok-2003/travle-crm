# 0022: Permanent deletion: purging an organization, erasing one person

Date: 2026-10-16 · Status: accepted · Implements spec section 5 ("permanent deletion happens only through a
super-admin action in the platform console")

## Decision

- **Each module deletes what it owns**, through a function the platform's jobs call in a platform transaction, so no
  module reaches another's tables:
  - files: `storedFileKeys` and `deleteRecordFiles` give the storage keys of the rows they cover; the bytes are deleted
    with the storage port's new `delete`, after the transaction commits, and deleting again is harmless. A
    system-owned record's files (an issued document's PDF) go only with their record, in a whole-organization purge;
  - audit: `redactAuditEntries` replaces one record's snapshots with `{ "redacted": true }` through the platform role's
    column grant (ADR 0015), keeping who did what and when;
  - notifications: `forgetRecipient` deletes the person's notifications, opt-outs and push subscriptions;
  - identity: `erasePerson` clears a removed person's name, addresses and every way to sign in, keeping the user's id,
    and `deleteUsers` deletes an organization's people (ADR 0021's module).
- **Exports first.** `exportedFiles` and `auditEntriesAbout` give what the export before a purge or an erasure holds;
  the export lists files with download links that lapse, rather than copying them.
- **The runtime role can't do any of it.** It has no right to delete attachments or notifications, or to change audit
  entries; each of these functions fails with "permission denied" outside a platform transaction.

## Context

- **Why bytes after the commit.** If the transaction rolls back, the files are still there with their rows. If the
  storage deletes stop halfway, rerunning the job deletes the rest: a key with nothing stored is fine.
- **Why redact rather than delete audit entries.** The log says that something happened, by whom and when; erasure
  removes what it says about the person, and nothing else.

## Consequences

- A PDF render that runs at the very moment of an organization's purge could store its one file after the purge's
  storage pass. Purges run only on cancelled organizations, which make nothing new, so the window is a job queued
  before the cancellation.
- Later modules (CRM's travellers) add their own step to erasure, as these do.
