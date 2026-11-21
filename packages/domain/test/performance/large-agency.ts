// A large agency for the performance tests (spec 7, ADR 0028): 50,000 leads with their people, 100,000 tasks, 500
// staff and 300 destinations in one organization, written set-based (INSERT … SELECT generate_series) through the
// platform client, which may write any organization's rows (P11). Names repeat as real ones do, so a search finds
// dozens; phones are unique. Each of the staff owns an equal run of leads, in every stage: 10% New, 40% the other open
// stages, 50% closed. Tasks are follow-ups on the leads, two a lead, their owners': 60% done, 5% cancelled, 35% open,
// due from 30 days ago to 30 days ahead. Then ANALYZE, as the tables' owner. seedChatsAndCalls adds WhatsApp chats and
// calls for the Not contacted yet rule.
import { randomUUID } from "node:crypto";
import type { PlatformClient } from "@travel-crm/db/platform";
import { analyzeTables, type DbUrls } from "@travel-crm/db/testing";
import { newUuidV7 } from "../../src/kernel/index.js";

/**
 * Ids for rows made in one statement, ascending, so ORDER BY id keeps the order the rows were made in, as Postgres 18's
 * uuidv7() does within a statement, and the seed runs on Postgres 17 too.
 */
function orderedIds(count: number): string[] {
  return Array.from({ length: count }, () => newUuidV7()).sort();
}

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
    SELECT ${organizationId}::uuid, (${orderedIds(size.destinations)}::uuid[])[n], 'Destination ' || n, now()
    FROM generate_series(1, ${size.destinations}) AS n`;
  // One person a lead, made in the order of their leads, so each lead's person is the person of its number.
  await platform.$executeRaw`
    INSERT INTO person (organization_id, id, name, phone_e164, created_at, updated_at)
    SELECT ${organizationId}::uuid, (${orderedIds(size.leads)}::uuid[])[n],
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
    SELECT ${organizationId}::uuid, (${orderedIds(size.leads)}::uuid[])[people.n], people.id,
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
    SELECT ${organizationId}::uuid, (${orderedIds(size.tasks)}::uuid[])[t],
      -- A third are plain tasks: My tasks leaves the follow-ups out of its Overdue and Due today.
      CASE WHEN t % 3 = 0 THEN 'task' ELSE 'follow-up' END, 'Call back ' || t, due_at,
      due_at, owner_user_id, 'lead', lead_id,
      CASE WHEN t % 20 < 12 THEN due_at END,
      CASE WHEN t % 20 < 12 THEN owner_user_id END,
      CASE WHEN t % 20 = 12 THEN due_at END,
      now()
    FROM planned
    ORDER BY t`;
  await analyzeTables(urls, ["destination", "person", "lead", "task"]);
  return { ownerUserIds };
}

/**
 * The agency's WhatsApp and calls, for the Not contacted yet rule's plans (leads show spec): one number, a chat with the
 * person of every even-numbered lead (lead n's person is person n), each holding the customer's message, the sales
 * cadence's automatic greeting and the customer's answer, and a member's reply where n is a multiple of 4; and a call
 * logged on every 30th lead. The messages are written after every lead came in. Then ANALYZE.
 */
export async function seedChatsAndCalls(platform: PlatformClient, urls: DbUrls, organizationId: string): Promise<void> {
  await platform.$executeRaw`
    INSERT INTO whatsapp_connection (organization_id, id, integrated_number, display_number, mode, status)
    VALUES (${organizationId}::uuid, gen_random_uuid(), '919800000000', '+919800000000', 'new_number', 'connected')`;
  await platform.$executeRaw`
    WITH people AS (
      SELECT id, phone_e164, row_number() OVER (ORDER BY id) AS n FROM person
      WHERE organization_id = ${organizationId}::uuid
    )
    INSERT INTO whatsapp_conversation (organization_id, id, connection_id, phone_e164, person_id)
    SELECT ${organizationId}::uuid, gen_random_uuid(), connection.id, people.phone_e164, people.id
    FROM people CROSS JOIN whatsapp_connection connection
    WHERE connection.organization_id = ${organizationId}::uuid AND people.n % 2 = 0`;
  await platform.$executeRaw`
    WITH chats AS (
      SELECT chat.id, people.n FROM whatsapp_conversation chat
      JOIN (SELECT id, row_number() OVER (ORDER BY id) AS n FROM person WHERE organization_id = ${organizationId}::uuid)
        AS people ON people.id = chat.person_id
      WHERE chat.organization_id = ${organizationId}::uuid
    )
    INSERT INTO whatsapp_message (organization_id, id, conversation_id, direction, origin, kind, body, status,
      client_token, occurred_at)
    SELECT ${organizationId}::uuid, gen_random_uuid(), chats.id,
      CASE WHEN m % 2 = 1 THEN 'in' ELSE 'out' END,
      CASE m WHEN 2 THEN 'automation' WHEN 4 THEN 'staff_crm' ELSE 'customer' END,
      'text', 'Hello', CASE WHEN m % 2 = 1 THEN 'received' ELSE 'sent' END,
      CASE WHEN m = 2 THEN 'speed:' || chats.id END,
      now() + m * interval '1 second'
    FROM chats CROSS JOIN generate_series(1, 4) AS m
    WHERE m < 4 OR chats.n % 4 = 0`;
  await platform.$executeRaw`
    INSERT INTO lead_call (organization_id, id, lead_id, outcome)
    SELECT ${organizationId}::uuid, gen_random_uuid(), leads.id, 'no_answer'
    FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM lead WHERE organization_id = ${organizationId}::uuid)
      AS leads
    WHERE leads.n % 30 = 0`;
  await analyzeTables(urls, ["whatsapp_connection", "whatsapp_conversation", "whatsapp_message", "lead_call"]);
}
