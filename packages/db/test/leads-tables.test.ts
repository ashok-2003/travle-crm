// Rules the release 1 tables keep themselves (spec 5, ADR 0028): a person always has a contact, each contact belongs to
// one live person, stored contacts are normalised, a lead's values stay within the fixed lists and its travel fits its
// kind, a destination's name is unique among live ones whatever its case, and a purge still works with merged
// destinations. Every insert runs as the runtime role inside forOrg; a refusal is matched by its constraint's name.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import type { OrgTx } from "../src/for-org.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import {
  createPlatformClient,
  createPlatformDatabase,
  deleteOrganizationRows,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { softDeleted } from "../src/soft-delete.js";
import { emptySql, joinSql, sql } from "../src/sql.js";
import { analyzeTables } from "./analyze-tables.js";
import { createTestOrganization } from "./helpers.js";

const deletedBy = "0199e7a0-0000-7000-8000-00000000c0d1";

describe("the leads tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let personId: string;
  let leadId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const addLead = (data: Partial<Prisma.LeadUncheckedCreateInput>) =>
    inOrg((tx) => tx.lead.create({ data: { personId, source: "walk_in", ...data } }));
  const addEnquiry = (data: Partial<Prisma.LeadEnquiryUncheckedCreateInput>) =>
    inOrg((tx) => tx.leadEnquiry.create({ data: { leadId, source: "referral", ...data } }));

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Leads tables");
    personId = (await inOrg((tx) => tx.person.create({ data: { name: "Asha Rao", phoneE164: "+919800000001" } }))).id;
    leadId = (await addLead({})).id;
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("creates pg_trgm and btree_gist in the migration, as the migrator", async () => {
    // bootstrap.sql leaves them to the leads_by_hand migration, so tests run the CREATE EXTENSION a hosted database's
    // first migrate runs, as app_migrator: an extension belongs to the role that created it.
    const rows = await platform.$queryRaw<{ extname: string; owner: string }[]>`
      SELECT e.extname, r.rolname AS owner FROM pg_extension e JOIN pg_roles r ON r.oid = e.extowner
      WHERE e.extname IN ('btree_gist', 'pg_trgm')
      ORDER BY e.extname`;
    expect(rows).toEqual([
      { extname: "btree_gist", owner: "app_migrator" },
      { extname: "pg_trgm", owner: "app_migrator" },
    ]);
  });

  it("gives each table a unique (organization_id, id), for keys from later tables", async () => {
    const tables = ["person", "lead", "lead_timeline_entry", "lead_note", "lead_enquiry", "blocked_contact"];
    tables.push("destination", "task");
    const rows = await platform.$queryRaw<{ table: string }[]>`
      SELECT t.relname AS table
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
      WHERE i.indisunique AND i.indpred IS NULL AND t.relname = ANY(${tables}::text[])
        AND (SELECT array_agg(a.attname::text ORDER BY k.ordinality)
             FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
             JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum) = ARRAY['organization_id', 'id']`;
    expect(rows.map((row) => row.table).sort()).toEqual([...tables].sort());
  });

  it("refuses a person with no phone, email or handle", async () => {
    await expect(inOrg((tx) => tx.person.create({ data: { name: "Nobody" } }))).rejects.toThrow(/person_has_contact/);
    await expect(inOrg((tx) => tx.person.create({ data: { name: "", phoneE164: "+919800000002" } }))).rejects.toThrow(
      /person_name_length/,
    );
  });

  it("keeps each phone, email and handle to one live person, and frees it when that person is deleted", async () => {
    const contacts = [{ phoneE164: "+919876543210" }, { email: "rahul@example.in" }, { instagramHandle: "rahul.s" }];
    for (const contact of contacts) {
      const first = await inOrg((tx) => tx.person.create({ data: { name: "Rahul Sharma", ...contact } }));
      await expect(
        inOrg((tx) => tx.person.create({ data: { name: "Rahul again", ...contact } })),
        JSON.stringify(contact),
      ).rejects.toThrow(/Unique constraint/);
      await inOrg((tx) => tx.person.update({ where: { id: first.id }, data: softDeleted(deletedBy) }));
      await expect(
        inOrg((tx) => tx.person.create({ data: { name: "Rahul again", ...contact } })),
      ).resolves.toMatchObject(contact);
    }
    const otherOrganization = await createTestOrganization(platform, "Same phone elsewhere");
    await expect(
      db.forOrg(otherOrganization, (tx) => tx.person.create({ data: { name: "Rahul", phoneE164: "+919876543210" } })),
    ).resolves.toMatchObject({ phoneE164: "+919876543210" });
  });

  it("stores emails in lower case and handles without @, in lower case", async () => {
    const cases: [Partial<Prisma.PersonUncheckedCreateInput>, string][] = [
      [{ email: "Rahul@X.in" }, "person_email_lower"],
      [{ instagramHandle: "@rahul" }, "person_instagram_format"],
      [{ instagramHandle: "Rahul.S" }, "person_instagram_format"],
      [{ phoneE164: "9876543210" }, "person_phone_format"],
    ];
    for (const [contact, constraint] of cases) {
      await expect(
        inOrg((tx) => tx.person.create({ data: { name: "Rahul", ...contact } })),
        constraint,
      ).rejects.toThrow(new RegExp(`\\b${constraint}\\b`));
    }
  });

  it("holds stages, trip types, hotel categories, food, sources and budget bases to their lists", async () => {
    const cases: [Partial<Prisma.LeadUncheckedCreateInput>, string][] = [
      [{ stage: "closed" }, "lead_stage_value"],
      [{ reopenStage: "won" }, "lead_reopen_stage_open"],
      [{ tripType: "cruise" }, "lead_trip_type_value"],
      [{ hotelCategory: "7_star" }, "lead_hotel_category_value"],
      [{ food: "vegan" }, "lead_food_value"],
      [{ source: "carrier_pigeon" }, "lead_source_value"],
      [{ budgetPaise: 100n, budgetBasis: "per_family" }, "lead_budget_basis_value"],
      [{ budgetPaise: 100n }, "lead_budget_pair"],
      [{ budgetPaise: 0n, budgetBasis: "per_person" }, "lead_budget_positive"],
      [{ adults: 0 }, "lead_adults_range"],
      [{ travelKind: "someday" }, "lead_travel_kind_value"],
      [{ departureCity: "x".repeat(121) }, "lead_text_lengths"],
    ];
    for (const [data, constraint] of cases) {
      await expect(addLead(data), constraint).rejects.toThrow(new RegExp(`\\b${constraint}\\b`));
    }
    await expect(addEnquiry({ tripType: "cruise" })).rejects.toThrow(/\blead_enquiry_trip_type_value\b/);
    await expect(addEnquiry({ source: "carrier_pigeon" })).rejects.toThrow(/\blead_enquiry_source_value\b/);
    await expect(
      addLead({
        stage: "booking_requested",
        reopenStage: "quote_sent",
        tripType: "pilgrimage",
        hotelCategory: "3_star",
        food: "jain",
        source: "meta_lead_ad",
        budgetPaise: 12_50_000_00n,
        budgetBasis: "for_everyone",
        adults: 4,
      }),
    ).resolves.toMatchObject({ stage: "booking_requested", budgetPaise: 12_50_000_00n });
  });

  it("fits a lead's travel to its kind: dates in order, a month as its first day, nothing when flexible", async () => {
    const fitting: Partial<Prisma.LeadUncheckedCreateInput>[] = [
      { travelKind: "dates", travelStart: new Date("2026-11-14"), travelEnd: new Date("2026-11-20") },
      { travelKind: "dates", travelStart: new Date("2026-11-14"), travelEnd: new Date("2026-11-14") },
      { travelKind: "month", travelMonth: new Date("2026-12-01") },
      { travelKind: "flexible" },
      { travelKind: "unknown" },
    ];
    for (const travel of fitting) await expect(addLead(travel), JSON.stringify(travel)).resolves.toBeDefined();
    const unfit: Partial<Prisma.LeadUncheckedCreateInput>[] = [
      { travelKind: "dates", travelStart: new Date("2026-11-20"), travelEnd: new Date("2026-11-14") },
      { travelKind: "dates", travelStart: new Date("2026-11-14") },
      { travelKind: "month", travelMonth: new Date("2026-12-15") },
      { travelKind: "month", travelMonth: new Date("2026-12-01"), travelStart: new Date("2026-12-01") },
      { travelKind: "flexible", travelMonth: new Date("2026-12-01") },
      { travelKind: "unknown", travelStart: new Date("2026-11-14"), travelEnd: new Date("2026-11-20") },
    ];
    for (const travel of unfit) {
      await expect(addLead(travel), JSON.stringify(travel)).rejects.toThrow(/\blead_travel_fits_kind\b/);
    }
    await expect(addEnquiry({ travelKind: "month", travelMonth: new Date("2026-12-15") })).rejects.toThrow(
      /\blead_enquiry_travel_fits_kind\b/,
    );
  });

  it("holds children's ages between 0 and 17, at most twenty", async () => {
    await expect(addLead({ childrenAges: [0, 17, 9] })).resolves.toMatchObject({ childrenAges: [0, 17, 9] });
    for (const childrenAges of [[18], [-1], Array.from({ length: 21 }, () => 5)]) {
      await expect(addLead({ childrenAges }), JSON.stringify(childrenAges)).rejects.toThrow(/\blead_children_ages\b/);
    }
    await expect(addEnquiry({ childrenAges: [18] })).rejects.toThrow(/\blead_enquiry_children_ages\b/);
  });

  it("holds timeline kinds, notes, blocked contacts and tasks to their rules", async () => {
    const task = { kind: "task", title: "Call back", dueAt: new Date(), firstDueAt: new Date() };
    const refusals: [() => Promise<unknown>, string][] = [
      [() => inOrg((tx) => tx.leadTimelineEntry.create({ data: { leadId, kind: "liked" } })), "kind_value"],
      [() => inOrg((tx) => tx.leadNote.create({ data: { leadId, body: "" } })), "lead_note_body_length"],
      [() => inOrg((tx) => tx.leadNote.create({ data: { leadId, body: "x".repeat(4001) } })), "lead_note_body_length"],
      [() => inOrg((tx) => tx.blockedContact.create({ data: { kind: "fax", value: "1" } })), "kind_value"],
      [() => inOrg((tx) => tx.destination.create({ data: { name: " Goa" } })), "destination_name_length"],
      [() => inOrg((tx) => tx.task.create({ data: { ...task, kind: "chore" } })), "task_kind_value"],
      [() => inOrg((tx) => tx.task.create({ data: { ...task, title: "x".repeat(201) } })), "task_title_length"],
      [() => inOrg((tx) => tx.task.create({ data: { ...task, recordType: "lead" } })), "task_record_pair"],
      [() => inOrg((tx) => tx.task.create({ data: { ...task, kind: "follow-up" } })), "task_follow_up_has_record"],
      [
        () => inOrg((tx) => tx.task.create({ data: { ...task, doneAt: new Date(), cancelledAt: new Date() } })),
        "task_done_or_cancelled",
      ],
    ];
    for (const [insert, constraint] of refusals) {
      await expect(insert(), constraint).rejects.toThrow(new RegExp(constraint));
    }
  });

  it("names a destination once among live ones, ignoring case", async () => {
    const goa = await inOrg((tx) => tx.destination.create({ data: { name: "Goa" } }));
    await expect(inOrg((tx) => tx.destination.create({ data: { name: "goa" } }))).rejects.toThrow(
      /destination_name_live/,
    );
    await inOrg((tx) => tx.destination.update({ where: { id: goa.id }, data: softDeleted(deletedBy) }));
    await expect(inOrg((tx) => tx.destination.create({ data: { name: "GOA" } }))).resolves.toMatchObject({
      name: "GOA",
    });
  });

  it("runs composed SQL with its values as parameters, inside the organization", async () => {
    const conditions = [sql`stage = ${"new"}`, sql`person_id = ${personId}::uuid`];
    const query = sql`SELECT count(*)::int AS n FROM lead WHERE ${joinSql(conditions, " AND ")}${emptySql}`;
    expect(query.values).toEqual(["new", personId]);
    const [row] = await inOrg((tx) => tx.$queryRaw<{ n: number }[]>(query));
    expect(row?.n).toBeGreaterThan(0);
  });

  it("analyzes tables for the planner as their owner", async () => {
    await analyzeTables(urls, ["lead_note"]);
    const [table] = await platform.$queryRaw<{ reltuples: number }[]>`
      SELECT reltuples::float8 AS reltuples FROM pg_class WHERE relname = 'lead_note'`;
    expect(table?.reltuples).toBeGreaterThanOrEqual(0);
    await expect(analyzeTables(urls, ["lead; DROP TABLE lead"])).rejects.toThrow(RangeError);
  });

  it("purges an organization whose destinations were merged", async () => {
    const purged = await createTestOrganization(platform, "Merged destinations");
    await db.forOrg(purged, async (tx) => {
      const kept = await tx.destination.create({ data: { name: "Kashmir" } });
      await tx.destination.create({ data: { name: "Srinagar", mergedIntoId: kept.id, ...softDeleted(deletedBy) } });
    });
    await expect(platformDb.transaction((tx) => deleteOrganizationRows(tx, purged))).resolves.toMatchObject({
      destination: 2,
      organization: 1,
    });
  });
});
