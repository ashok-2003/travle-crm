// People (spec 3.2, 4): found again by their phone, else their email, else their Instagram handle (R4), each exactly,
// through the live unique indexes; added; and given a contact they lack, but only one no other live person holds
// (R32). A person's contacts appear in the audit log only in person.* entries, which erasure redacts (R28).
import { openLeadStages, type ContactKind } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import type { Actor } from "../kernel/index.js";
import { recordCrmAudit } from "./crm-audit.js";

/** Contacts as the contracts hand them over, each as stored: E.164, a lower-case email, a handle without "@". */
export interface PersonContactValues {
  phone?: string | undefined;
  email?: string | undefined;
  instagramHandle?: string | undefined;
}

export interface PersonRow {
  id: string;
  name: string;
  phoneE164: string | null;
  email: string | null;
  instagramHandle: string | null;
}

export const personColumns = { id: true, name: true, phoneE164: true, email: true, instagramHandle: true } as const;

type ContactColumn = "phoneE164" | "email" | "instagramHandle";

/** Each kind of contact, its column, and its key among the given contacts, in the order a match tries them (R4). */
export const contactFields: readonly { kind: ContactKind; column: ContactColumn; key: keyof PersonContactValues }[] = [
  { kind: "phone", column: "phoneE164", key: "phone" },
  { kind: "email", column: "email", key: "email" },
  { kind: "instagram", column: "instagramHandle", key: "instagramHandle" },
];

/** The where-clause for people holding one contact. */
export function holding(column: ContactColumn, value: string) {
  switch (column) {
    case "phoneE164":
      return { phoneE164: value };
    case "email":
      return { email: value };
    case "instagramHandle":
      return { instagramHandle: value };
  }
}

/** How the audit log holds a person: their name and contacts, by the names the api gives them. */
export function personSnapshot(person: Omit<PersonRow, "id">) {
  return {
    name: person.name,
    phone: person.phoneE164,
    email: person.email,
    instagramHandle: person.instagramHandle,
  };
}

/** The live person the contacts belong to: the phone's, else the email's, else the handle's; null for nobody. */
export async function matchPerson(
  tx: OrgTx,
  contacts: PersonContactValues,
): Promise<{ person: PersonRow; matchedBy: ContactKind } | null> {
  for (const field of contactFields) {
    const value = contacts[field.key];
    if (value === undefined) continue;
    const person = await tx.person.findFirst({ where: holding(field.column, value), select: personColumns });
    if (person !== null) return { person, matchedBy: field.kind };
  }
  return null;
}

/** Whether another live person than `personId` holds the contact. */
export async function heldByAnother(
  tx: OrgTx,
  personId: string,
  column: ContactColumn,
  value: string,
): Promise<boolean> {
  const holder = await tx.person.findFirst({
    where: { ...holding(column, value), id: { not: personId } },
    select: { id: true },
  });
  return holder !== null;
}

/** Adds a person with their name and contacts (P4: the demo adds people through this too). */
export async function addPerson(
  tx: OrgTx,
  actor: Actor,
  input: PersonContactValues & { name: string },
): Promise<PersonRow> {
  const person = await tx.person.create({
    data: {
      name: input.name,
      phoneE164: input.phone ?? null,
      email: input.email ?? null,
      instagramHandle: input.instagramHandle ?? null,
      createdBy: actor.userId,
    },
    select: personColumns,
  });
  await recordCrmAudit(tx, actor, {
    action: "person.added",
    entityType: "person",
    entityId: person.id,
    after: personSnapshot(person),
  });
  await publishEvent(tx, { type: "person.added", payload: { personId: person.id } });
  return person;
}

/**
 * Gives the person each contact they lack that the form brought, unless another live person holds it (then it is
 * dropped, R32); a contact they have is never overwritten. Recorded as person.edited (P5). Returns the kinds added.
 */
export async function fillMissingContacts(
  tx: OrgTx,
  actor: Actor,
  person: PersonRow,
  contacts: PersonContactValues,
): Promise<ContactKind[]> {
  const after = { ...person };
  const filled: ContactKind[] = [];
  for (const field of contactFields) {
    const value = contacts[field.key];
    if (value === undefined || person[field.column] !== null) continue;
    if (await heldByAnother(tx, person.id, field.column, value)) continue;
    after[field.column] = value;
    filled.push(field.kind);
  }
  if (filled.length === 0) return [];
  const { phoneE164, email, instagramHandle } = after;
  await tx.person.update({ where: { id: person.id }, data: { phoneE164, email, instagramHandle } });
  await recordPersonEdit(tx, actor, person, after);
  return filled;
}

/** Records a change to a person, the changed fields only, and publishes person.edited. */
export async function recordPersonEdit(
  tx: OrgTx,
  actor: Actor,
  before: PersonRow,
  after: Omit<PersonRow, "id">,
): Promise<void> {
  const was: Record<string, string | null> = personSnapshot(before);
  const now: Record<string, string | null> = personSnapshot(after);
  const changed = Object.keys(now).filter((key) => was[key] !== now[key]);
  const pick = (side: Record<string, string | null>) =>
    Object.fromEntries(changed.map((key) => [key, side[key] ?? null]));
  await recordCrmAudit(tx, actor, {
    action: "person.edited",
    entityType: "person",
    entityId: before.id,
    before: pick(was),
    after: pick(now),
  });
  await publishEvent(tx, { type: "person.edited", payload: { personId: before.id } });
}

/** The person's newest open lead (any stage but Won, Lost and Not a lead), or null. */
export function newestOpenLead(
  tx: OrgTx,
  personId: string,
): Promise<{ id: string; ownerUserId: string | null; destinationId: string | null } | null> {
  return tx.lead.findFirst({
    where: { personId, stage: { in: [...openLeadStages] } },
    orderBy: { id: "desc" },
    select: { id: true, ownerUserId: true, destinationId: true },
  });
}
