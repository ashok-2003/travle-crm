// What the check and the add look up for a whole file or a batch of rows (spec B25, B26): the people holding the rows'
// contacts, their open leads and any lead, the blocked contacts, and the agency's destinations, each in one query for
// all the rows, `= ANY` on the live unique indexes. Raw SQL names deleted_at itself: soft-delete filtering is Prisma's.
import type { ContactKind } from "@travel-crm/contracts/crm";
import { sql, type OrgTx, type Sql } from "@travel-crm/db";
import type { LeadRowContacts, LeadRowReading } from "./lead-row.js";

const COLUMN_OF: Readonly<Record<ContactKind, Sql>> = {
  phone: sql`phone_e164`,
  email: sql`email`,
  instagram: sql`instagram_handle`,
};

const OPEN_STAGES = sql`stage = ANY (ARRAY['new', 'contacted', 'quote_sent', 'booking_requested'])`;

/** The live people holding any of these values of one kind of contact, with all their contacts. */
export function personContactsQuery(kind: ContactKind, values: readonly string[]): Sql {
  return sql`
    SELECT id, name, phone_e164 AS phone, email, instagram_handle AS "instagramHandle"
    FROM person
    WHERE deleted_at IS NULL AND ${COLUMN_OF[kind]} = ANY(${values}::text[])`;
}

/** Each of these people's newest open lead, on lead_person. */
export function openLeadsOfQuery(personIds: readonly string[]): Sql {
  return sql`
    SELECT DISTINCT ON (person_id) person_id AS "personId", id AS "leadId"
    FROM lead
    WHERE person_id = ANY(${personIds}::uuid[]) AND deleted_at IS NULL AND ${OPEN_STAGES}
    ORDER BY person_id, id DESC`;
}

/** The people among these who have any live lead, open or closed (the Sheets sync's in_crm, and Returning). */
export function anyLeadOfQuery(personIds: readonly string[]): Sql {
  return sql`
    SELECT DISTINCT person_id AS "personId"
    FROM lead
    WHERE person_id = ANY(${personIds}::uuid[]) AND deleted_at IS NULL`;
}

/** The blocked contacts among these, on blocked_contact_live. */
export function blockedContactsQuery(values: { kind: ContactKind; value: string }[]): Sql {
  const of = (kind: ContactKind) => values.filter((value) => value.kind === kind).map((value) => value.value);
  return sql`
    SELECT kind, value
    FROM blocked_contact
    WHERE deleted_at IS NULL AND (
      (kind = 'phone' AND value = ANY(${of("phone")}::text[]))
      OR (kind = 'email' AND value = ANY(${of("email")}::text[]))
      OR (kind = 'instagram' AND value = ANY(${of("instagram")}::text[])))`;
}

/** The agency's live destinations among these names, ignoring case, on destination_name_live. */
export function destinationsNamedQuery(lowerNames: readonly string[]): Sql {
  return sql`
    SELECT lower(name) AS name
    FROM destination
    WHERE deleted_at IS NULL AND lower(name) = ANY(${lowerNames}::text[])`;
}

export interface KnownPerson {
  id: string;
  contacts: LeadRowContacts;
}

export interface LeadLookups {
  /** The person the contacts belong to: the phone's, else the email's, else the handle's (R4); null for nobody. */
  personOf(contacts: LeadRowContacts): KnownPerson | null;
  openLeadOf(personId: string): string | null;
  /** Whether the person has any live lead. */
  hasLead(personId: string): boolean;
  isBlocked(contacts: LeadRowContacts): boolean;
  hasDestination(name: string): boolean;
}

const KINDS: readonly { kind: ContactKind; key: keyof LeadRowContacts }[] = [
  { kind: "phone", key: "phone" },
  { kind: "email", key: "email" },
  { kind: "instagram", key: "instagramHandle" },
];

interface StoredPerson {
  id: string;
  phone: string | null;
  email: string | null;
  instagramHandle: string | null;
}

/** Everything the rows' contacts, leads and destinations need, in one query per kind for all of them. */
export async function lookUpLeadRows(tx: OrgTx, rows: readonly LeadRowReading[]): Promise<LeadLookups> {
  const enquiries = rows.flatMap((row) => (row.kind === "enquiry" ? [row] : []));
  const valuesOf = (key: keyof LeadRowContacts) => [...new Set(enquiries.flatMap((row) => row.contacts[key] ?? []))];
  const people = new Map<string, StoredPerson>();
  const holder = new Map<string, string>();
  for (const { kind, key } of KINDS) {
    const values = valuesOf(key);
    if (values.length === 0) continue;
    for (const person of await tx.$queryRaw<StoredPerson[]>(personContactsQuery(kind, values))) {
      people.set(person.id, person);
      const value = person[key];
      if (value !== null) holder.set(`${kind}:${value}`, person.id);
    }
  }
  const personIds = [...people.keys()];
  const open = new Map<string, string>();
  const withLead = new Set<string>();
  if (personIds.length > 0) {
    for (const lead of await tx.$queryRaw<{ personId: string; leadId: string }[]>(openLeadsOfQuery(personIds))) {
      open.set(lead.personId, lead.leadId);
    }
    for (const lead of await tx.$queryRaw<{ personId: string }[]>(anyLeadOfQuery(personIds))) {
      withLead.add(lead.personId);
    }
  }
  const contactValues = KINDS.flatMap(({ kind, key }) => valuesOf(key).map((value) => ({ kind, value })));
  const blocked = new Set(
    contactValues.length === 0
      ? []
      : (await tx.$queryRaw<{ kind: ContactKind; value: string }[]>(blockedContactsQuery(contactValues))).map(
          (contact) => `${contact.kind}:${contact.value}`,
        ),
  );
  const destinationNames = [
    ...new Set(enquiries.flatMap((row) => (row.destinationName === null ? [] : [row.destinationName.toLowerCase()]))),
  ];
  const destinations = new Set(
    destinationNames.length === 0
      ? []
      : (await tx.$queryRaw<{ name: string }[]>(destinationsNamedQuery(destinationNames))).map(
          (destination) => destination.name,
        ),
  );
  return {
    personOf(contacts) {
      for (const { kind, key } of KINDS) {
        const value = contacts[key];
        const id = value === null ? undefined : holder.get(`${kind}:${value}`);
        const person = id === undefined ? undefined : people.get(id);
        if (person !== undefined) {
          return {
            id: person.id,
            contacts: { phone: person.phone, email: person.email, instagramHandle: person.instagramHandle },
          };
        }
      }
      return null;
    },
    openLeadOf: (personId) => open.get(personId) ?? null,
    hasLead: (personId) => withLead.has(personId),
    isBlocked: (contacts) =>
      KINDS.some(({ kind, key }) => contacts[key] !== null && blocked.has(`${kind}:${contacts[key]}`)),
    hasDestination: (name) => destinations.has(name.toLowerCase()),
  };
}
