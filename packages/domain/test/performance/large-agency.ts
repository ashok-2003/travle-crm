// A large agency for the performance tests (spec 7, ADR 0028): 50,000 leads with their people, 100,000 tasks, 500
// staff and 300 destinations in one organization, written set-based (INSERT … SELECT generate_series) through the
// platform client, which may write any organization's rows (P11). Names repeat as real ones do, so a search finds
// dozens; phones are unique. Each of the staff owns an equal run of leads, in every stage: 10% New, 40% the other open
// stages, 50% closed. Tasks are follow-ups on the leads, two a lead, their owners': 60% done, 5% cancelled, 35% open,
// due from 30 days ago to 30 days ahead. Then ANALYZE, as the tables' owner.
import { randomUUID } from "node:crypto";
import type { PlatformClient } from "@travel-crm/db/platform";
import { analyzeTables, type DbUrls } from "@travel-crm/db/testing";

export interface LargeAgencySize {
  leads: number;
  tasks: number;
  staff: number;
  destinations: number;
}

const FIRST_NAMES = [
  "Rahul",
  "Priya",
  "Amit",
  "Sneha",
  "Vikram",
  "Ananya",
  "Rohan",
  "Kavya",
  "Arjun",
  "Meera",
  "Karan",
  "Pooja",
  "Suresh",
  "Divya",
  "Manish",
  "Neha",
  "Rajesh",
  "Isha",
  "Sanjay",
  "Ritu",
];
const LAST_NAMES = [
  "Sharma",
  "Verma",
  "Patel",
  "Iyer",
  "Nair",
  "Reddy",
  "Gupta",
  "Singh",
  "Menon",
  "Joshi",
  "Kapoor",
  "Mehta",
  "Rao",
  "Das",
  "Kulkarni",
  "Chopra",
  "Bose",
  "Pillai",
  "Malhotra",
  "Qureshi",
];

/** Seeds the organization; returns the staff's user ids, each owning an equal share of the leads. */
export async function seedLargeAgency(
  platform: PlatformClient,
  urls: DbUrls,
  organizationId: string,
  size: LargeAgencySize,
): Promise<{ ownerUserIds: string[] }> {
  const ownerUserIds = Array.from({ length: size.staff }, () => randomUUID());
  await platform.$executeRaw`
    INSERT INTO destination (organization_id, id, name, updated_at)
    SELECT ${organizationId}::uuid, uuidv7(), 'Destination ' || n, now()
    FROM generate_series(1, ${size.destinations}) AS n`;
  // One person a lead, made in the order of their leads, so each lead's person is the person of its number.
  await platform.$executeRaw`
    INSERT INTO person (organization_id, id, name, phone_e164, created_at, updated_at)
    SELECT ${organizationId}::uuid, uuidv7(),
      (${FIRST_NAMES}::text[])[1 + n % 20] || ' ' || (${LAST_NAMES}::text[])[1 + (n / 20) % 20],
      '+9198' || lpad(n::text, 8, '0'), now(), now()
    FROM generate_series(1, ${size.leads}) AS n`;
  await platform.$executeRaw`
    WITH people AS (
      SELECT id, row_number() OVER (ORDER BY id) AS n FROM person WHERE organization_id = ${organizationId}::uuid
    ),
    places AS (
      SELECT id, row_number() OVER (ORDER BY id) AS n FROM destination WHERE organization_id = ${organizationId}::uuid
    )
    INSERT INTO lead (organization_id, id, person_id, stage, owner_user_id, destination_id, source, created_at,
      updated_at)
    SELECT ${organizationId}::uuid, uuidv7(), people.id,
      (ARRAY['new', 'contacted', 'quote_sent', 'booking_requested', 'contacted', 'won', 'lost', 'not_a_lead', 'won',
        'lost'])[1 + people.n % 10],
      (${ownerUserIds}::uuid[])[1 + ((people.n - 1) * ${size.staff}) / ${size.leads}],
      places.id, 'phone_call', now() - (${size.leads} - people.n) * interval '5 minutes', now()
    FROM people JOIN places ON places.n = 1 + people.n % ${size.destinations}
    ORDER BY people.n`;
  await platform.$executeRaw`
    WITH leads AS (
      SELECT id, owner_user_id, row_number() OVER (ORDER BY id) AS n
      FROM lead WHERE organization_id = ${organizationId}::uuid
    ),
    planned AS (
      SELECT t, leads.id AS lead_id, leads.owner_user_id,
        now() - interval '30 days' + (t % 60) * interval '1 day' + (t % 24) * interval '1 hour' AS due_at
      FROM generate_series(1, ${size.tasks}) AS t JOIN leads ON leads.n = 1 + t % ${size.leads}
    )
    INSERT INTO task (organization_id, id, kind, title, due_at, first_due_at, assignee_user_id, record_type, record_id,
      done_at, done_by, cancelled_at, updated_at)
    SELECT ${organizationId}::uuid, uuidv7(), 'follow-up', 'Call back ' || t, due_at, due_at, owner_user_id, 'lead',
      lead_id,
      CASE WHEN t % 20 < 12 THEN due_at END,
      CASE WHEN t % 20 < 12 THEN owner_user_id END,
      CASE WHEN t % 20 = 12 THEN due_at END,
      now()
    FROM planned
    ORDER BY t`;
  await analyzeTables(urls, ["destination", "person", "lead", "task"]);
  return { ownerUserIds };
}
