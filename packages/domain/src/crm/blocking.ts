// Blocking a lead's contact (spec 3.4, 4; R33): the lead becomes Not a lead and its phone, else email, else handle goes
// on the blocked list, which only warns the form in release 1; the person's other leads are untouched. Settings lists
// the blocked contacts and unblocks them, so they can be blocked again. A blocked value never enters the audit log
// (R28). Blocking, listing and unblocking need leads:assign, which the api checks.
import {
  contactKind,
  type BlockedContactsInput,
  type BlockedContactsPage,
  type ContactKind,
  type LeadIdInput,
  type UnblockContactInput,
} from "@travel-crm/contracts/crm";
import { softDeleted, type OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { changeLeadStage } from "./lead-core.js";
import { findLeadInScope } from "./lead-detail.js";
import { contactFields, personColumns, type PersonContactValues } from "./people.js";

/** Whether any of the contacts is on the blocked list (R33): the form warns, and saving still works (spec 4). */
export async function isBlocked(tx: OrgTx, contacts: PersonContactValues): Promise<boolean> {
  const given = contactFields.flatMap((field) => {
    const value = contacts[field.key];
    return value === undefined ? [] : [{ kind: field.kind, value }];
  });
  if (given.length === 0) return false;
  return (await tx.blockedContact.count({ where: { OR: given } })) > 0;
}

/**
 * Puts a contact, as stored, on the blocked list (P4: the demo blocks through this too). A value already blocked adds
 * nothing, even when two blocks race: the live unique index keeps one. Returns whether it was added.
 */
export async function addBlockedContact(
  tx: OrgTx,
  actor: Actor,
  contact: { kind: ContactKind; value: string },
): Promise<boolean> {
  const [added] = await tx.blockedContact.createManyAndReturn({
    data: [{ kind: contact.kind, value: contact.value, blockedBy: actor.userId }],
    skipDuplicates: true,
    select: { id: true },
  });
  if (added === undefined) return false;
  await recordCrmAudit(tx, actor, {
    action: "blocked-contact.added",
    entityType: "blocked_contact",
    entityId: added.id,
    after: { kind: contact.kind },
  });
  await publishEvent(tx, { type: "blocked-contact.added", payload: { blockedContactId: added.id } });
  return true;
}

/** Blocks the lead's phone, else its email, else its handle, and marks the lead Not a lead. */
export async function blockLeadContact(tx: OrgTx, access: MemberAccess, input: LeadIdInput, now: Date): Promise<void> {
  const lead = await findLeadInScope(tx, access, input.leadId);
  const person = await tx.person.findUniqueOrThrow({ where: { id: lead.personId }, select: personColumns });
  const [first] = contactFields.flatMap((field) => {
    const value = person[field.column];
    return value === null ? [] : [{ kind: field.kind, value }];
  });
  if (first !== undefined) await addBlockedContact(tx, access, first);
  await changeLeadStage(tx, access, { leadId: lead.id, stage: "not_a_lead" }, now);
}

/** One page of blocked contacts, newest first; the router adds the names. */
export async function listBlockedContacts(
  tx: OrgTx,
  input: BlockedContactsInput,
): Promise<Omit<BlockedContactsPage, "people">> {
  // One more than a page tells whether another page follows.
  const rows = await tx.blockedContact.findMany({
    where: input.before === undefined ? {} : { id: { lt: input.before } },
    orderBy: { id: "desc" },
    take: input.limit + 1,
    select: { id: true, kind: true, value: true, blockedBy: true, createdAt: true },
  });
  const page = rows.slice(0, input.limit);
  return {
    items: page.map((row) => ({
      id: row.id,
      kind: contactKind.parse(row.kind),
      value: row.value,
      blockedBy: row.blockedBy,
      blockedAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Unblocks a contact, so it can be blocked again later; one unblocked already is "not found". */
export async function unblockContact(tx: OrgTx, access: MemberAccess, input: UnblockContactInput): Promise<void> {
  const entry = await tx.blockedContact.findUnique({ where: { id: input.blockedContactId }, select: { kind: true } });
  // Updating only a live entry: a second tab's Unblock, waiting on this one's row, then finds none.
  const { count } = await tx.blockedContact.updateMany({
    where: { id: input.blockedContactId },
    data: softDeleted(access.userId),
  });
  if (entry === null || count === 0) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such blocked contact");
  await recordCrmAudit(tx, access, {
    action: "blocked-contact.removed",
    entityType: "blocked_contact",
    entityId: input.blockedContactId,
    before: { kind: entry.kind },
  });
  await publishEvent(tx, { type: "blocked-contact.removed", payload: { blockedContactId: input.blockedContactId } });
}
