// A large agency stays fast (spec 7, ADR 0028): with 50,000 leads, 100,000 tasks, 500 staff, 25,000 WhatsApp chats and
// their messages and a call on every 30th lead, the lead list, its counts, search, each Show and Today answer within
// their time budgets, and the list, the counts, Hot's reads and Today (the Not contacted yet checks too) read their
// indexes, never a whole table. Everything runs as the api does, as app_runtime inside forOrg, so the plans are the
// runtime's under row-level security, on a database of its own shared with a neighbouring agency of 100,000 leads
// made after it: in production many agencies share the tables, and the planner chooses by how few rows are this one's.
// Search is held to a time alone: under row-level security Postgres won't use the non-leakproof LIKE and trigram
// operators as index conditions, so its plan filters the organization's rows (the controller's ruling for release 1).
import { openLeadStages, listLeadsInput, leadCountsInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx, type Sql } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { countLeads, leadCountsQuery, leadListQuery, listLeads } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { countUncontactedLeadsQuery, uncontactedLeadsQuery } from "../../src/inbox/index.js";
import { addDays, calendarDateIn, startOfDayIn } from "../../src/kernel/index.js";
import { countOpenTasksQuery, openTasksQuery } from "../../src/tasks/index.js";
import { travelSoonQuery } from "../../src/sales/hot-leads-queries.js";
import { leadsToShow, todaySummary } from "../../src/today/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { seedChatsAndCalls, seedLargeAgency } from "./large-agency.js";
import { fastestMs, planOf, type QueryPlan } from "./query-plans.js";

const SIZE = { leads: 50_000, tasks: 100_000, staff: 500, destinations: 300 };
const NEIGHBOUR = { leads: 100_000, tasks: 0, staff: 500, destinations: 300 };
const BIG_TABLES = ["lead", "person", "task", "lead_call", "whatsapp_conversation", "whatsapp_message"];

describe("a large agency", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let salesperson: MemberAccess;
  let manager: MemberAccess;
  /** Every plan the tests read, by query, for the full-scan check and the report. */
  const plans = new Map<string, QueryPlan>();
  const timings = new Map<string, number>();

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const plan = async (name: string, query: Sql) => {
    const found = await inOrg((tx) => planOf(tx, query));
    plans.set(name, found);
    return found;
  };
  const time = async (name: string, run: (tx: OrgTx) => Promise<unknown>) => {
    const ms = await fastestMs(() => inOrg(run));
    timings.set(name, ms);
    return ms;
  };

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Large agency");
    const { ownerUserIds } = await seedLargeAgency(platform, isolated.urls, organizationId, SIZE);
    await seedChatsAndCalls(platform, isolated.urls, organizationId);
    // Agencies share the database: one seeded after this one, so its rows are newer than all of this agency's.
    const neighbour = await createTestOrganization(platform, "Neighbouring agency");
    await seedLargeAgency(platform, isolated.urls, neighbour, NEIGHBOUR);
    const userId = ownerUserIds[0] ?? "";
    // One customer whose name no one else has, for a search that finds one person among every open lead.
    const zubin = await platform.person.create({
      data: { organizationId, name: "Zubin Wadhwani", phoneE164: "+917000000001" },
    });
    await platform.lead.create({
      data: { organizationId, personId: zubin.id, stage: "contacted", ownerUserId: userId, source: "referral" },
    });
    salesperson = memberWithStarterRole("sales", { organizationId, userId });
    manager = memberWithStarterRole("org-admin", { organizationId, userId });
  }, 300_000);

  afterAll(async () => {
    // One line for the record: each query's fastest time and the indexes its plan read (a failure prints the whole plan).
    const indexes = Object.fromEntries([...plans].map(([name, found]) => [name, found.indexes]));
    const fastest = Object.fromEntries([...timings].map(([name, ms]) => [name, Math.round(ms * 10) / 10]));
    console.info("Large agency:", JSON.stringify({ fastest, indexes }));
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("lists Mine · open within 150 ms, on lead_open_by_owner", async () => {
    const query = leadListQuery({ ownerUserId: salesperson.userId, stages: openLeadStages, limit: 26 });
    expect((await plan("mine-open", query)).indexes).toContain("lead_open_by_owner");
    const input = listLeadsInput.parse({});
    expect(await time("mine-open", (tx) => listLeads(tx, salesperson, input))).toBeLessThan(150);
  });

  it("lists Everyone · open within 150 ms, on lead_open", async () => {
    const query = leadListQuery({ ownerUserId: null, stages: openLeadStages, limit: 26 });
    expect((await plan("everyone-open", query)).indexes).toContain("lead_open");
    const input = listLeadsInput.parse({ view: "everyone" });
    expect(await time("everyone-open", (tx) => listLeads(tx, manager, input))).toBeLessThan(150);
  });

  it("pages Everyone · open by number within 250 ms, the last page and the total included", async () => {
    const first = listLeadsInput.parse({ view: "everyone", page: 1 });
    expect((await inOrg((tx) => listLeads(tx, manager, first))).total).toBe(SIZE.leads / 2 + 1);
    expect(await time("everyone-page-1", (tx) => listLeads(tx, manager, first))).toBeLessThan(250);
    const last = listLeadsInput.parse({ view: "everyone", page: Math.ceil((SIZE.leads / 2 + 1) / 25) });
    expect((await inOrg((tx) => listLeads(tx, manager, last))).items).toHaveLength(1);
    expect(await time("everyone-page-last", (tx) => listLeads(tx, manager, last))).toBeLessThan(250);
  });

  it("counts open leads by stage within 150 ms, on lead_open_stage_counts", async () => {
    expect((await plan("counts", leadCountsQuery({ ownerUserId: null }))).indexes).toContain("lead_open_stage_counts");
    const input = leadCountsInput.parse({ view: "everyone" });
    const counts = await inOrg((tx) => countLeads(tx, manager, input));
    // Half the seeded leads are open, and Zubin Wadhwani's.
    expect(counts.open).toBe(SIZE.leads / 2 + 1);
    expect(await time("counts", (tx) => countLeads(tx, manager, input))).toBeLessThan(150);
  });

  it("finds 'Rahul Shrma' within 250 ms", async () => {
    const search = { kind: "name" as const, text: "Rahul Shrma" };
    await plan("search-name", leadListQuery({ ownerUserId: null, stages: openLeadStages, search, limit: 26 }));
    const input = listLeadsInput.parse({ view: "everyone", search: "Rahul Shrma" });
    const page = await inOrg((tx) => listLeads(tx, manager, input));
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item) => item.person.name === "Rahul Sharma")).toBe(true);
    expect(await time("search-name", (tx) => listLeads(tx, manager, input))).toBeLessThan(250);
  });

  // The slow cases: a page that a match or two can't fill, so the scan reads every open lead of the agency.
  it("finds the one 'Zubin Wadhwani' within 250 ms, reading every open lead", async () => {
    const search = { kind: "name" as const, text: "Zubin Wadhwani" };
    await plan("search-name-one", leadListQuery({ ownerUserId: null, stages: openLeadStages, search, limit: 26 }));
    const input = listLeadsInput.parse({ view: "everyone", search: "Zubin Wadhwani" });
    const page = await inOrg((tx) => listLeads(tx, manager, input));
    expect(page.items.map((item) => item.person.name)).toEqual(["Zubin Wadhwani"]);
    expect(await time("search-name-one", (tx) => listLeads(tx, manager, input))).toBeLessThan(250);
  });

  it("finds nobody named 'Xavier Quintanilla' within 250 ms, reading every open lead", async () => {
    const search = { kind: "name" as const, text: "Xavier Quintanilla" };
    await plan("search-name-none", leadListQuery({ ownerUserId: null, stages: openLeadStages, search, limit: 26 }));
    const input = listLeadsInput.parse({ view: "everyone", search: "Xavier Quintanilla" });
    expect((await inOrg((tx) => listLeads(tx, manager, input))).items).toEqual([]);
    expect(await time("search-name-none", (tx) => listLeads(tx, manager, input))).toBeLessThan(250);
  });

  it("finds no lead for digits nobody has within 250 ms", async () => {
    const search = { kind: "digits" as const, digits: "99999" };
    await plan("search-digits-none", leadListQuery({ ownerUserId: null, stages: openLeadStages, search, limit: 26 }));
    const input = listLeadsInput.parse({ view: "everyone", search: "99999" });
    expect((await inOrg((tx) => listLeads(tx, manager, input))).items).toEqual([]);
    expect(await time("search-digits-none", (tx) => listLeads(tx, manager, input))).toBeLessThan(250);
  });

  it("finds a lead by five digits within 250 ms", async () => {
    const search = { kind: "digits" as const, digits: "12345" };
    await plan("search-digits", leadListQuery({ ownerUserId: null, stages: openLeadStages, search, limit: 26 }));
    const inStage = (stage: string) => listLeadsInput.parse({ view: "everyone", stage, search: "12345" });
    const found = await inOrg(async (tx) => {
      const pages = [];
      for (const stage of ["open", "won", "lost", "not_a_lead"])
        pages.push(await listLeads(tx, manager, inStage(stage)));
      return pages.flatMap((page) => page.items.map((item) => item.person.phone));
    });
    expect(found).toContain("+919800012345");
    expect(found.every((phone) => phone?.includes("12345"))).toBe(true);
    expect(await time("search-digits", (tx) => listLeads(tx, manager, inStage("open")))).toBeLessThan(250);
  });

  it("builds Today within 150 ms, on task_open_by_assignee and lead_new_by_owner, its calls and chats by index", async () => {
    const now = new Date();
    const overdue = openTasksQuery({ assigneeUserId: salesperson.userId, kind: "task", dueBefore: now, limit: 21 });
    expect((await plan("today-overdue", overdue)).indexes).toContain("task_open_by_assignee");
    const newLeads = uncontactedLeadsQuery({ ownerUserId: salesperson.userId, limit: 21 });
    // Each of the owner's New leads is checked for a call, then its person's chats and their messages, by index.
    const contactIndexes = ["lead_call_by_lead", "whatsapp_conversation_person", "whatsapp_message_chat"];
    expect((await plan("today-new-leads", newLeads)).indexes).toEqual(
      expect.arrayContaining(["lead_new_by_owner", ...contactIndexes]),
    );
    const endsAt = startOfDayIn(addDays(calendarDateIn(now, "Asia/Kolkata"), 1), "Asia/Kolkata");
    const assigneeUserId = salesperson.userId;
    const dueToday = openTasksQuery({ assigneeUserId, kind: "task", dueFrom: now, dueBefore: endsAt, limit: 21 });
    expect((await plan("today-due-today", dueToday)).indexes).toContain("task_open_by_assignee");
    const counted = {
      "today-overdue-count": countOpenTasksQuery({ assigneeUserId, kind: "task", dueBefore: now }),
      "today-due-today-count": countOpenTasksQuery({ assigneeUserId, kind: "task", dueFrom: now, dueBefore: endsAt }),
      "today-follow-ups-count": countOpenTasksQuery({ assigneeUserId, kind: "follow-up", dueBefore: endsAt }),
    };
    for (const [name, query] of Object.entries(counted)) {
      expect((await plan(name, query)).indexes, name).toContain("task_open_by_assignee");
    }
    const newLeadsCount = countUncontactedLeadsQuery(salesperson.userId);
    // Either partial index holds exactly the owner's leads in New for a count; the planner picks by its sampled
    // statistics, and both runs have been seen.
    const countPlan = await plan("today-new-leads-count", newLeadsCount);
    const ownersNewLeads = ["lead_new_by_owner", "lead_open_stage_counts"];
    expect(
      countPlan.indexes.filter((name) => ownersNewLeads.includes(name)),
      countPlan.text,
    ).not.toEqual([]);
    expect(countPlan.indexes, countPlan.text).toEqual(expect.arrayContaining(contactIndexes));
    const summary = await inOrg((tx) => todaySummary(tx, salesperson, now, { bookingsOn: true }));
    // The salesperson's New leads are numbers 10, 20 … 100 (seedLargeAgency); each has a chat with an automatic
    // greeting, a member replied on the multiples of 4 and a call is logged on 30, 60 and 90: 10, 50 and 70 wait.
    expect(summary.counts.newLeads).toBe(3);
    expect(summary.counts.overdue).toBeGreaterThan(0);
    expect(await time("today", (tx) => todaySummary(tx, salesperson, now, { bookingsOn: true }))).toBeLessThan(150);
  });

  it("lists each Show within 250 ms, a Hot read on the open leads' indexes", async () => {
    const now = new Date();
    const today = calendarDateIn(now, "Asia/Kolkata");
    const window = { from: today, to: addDays(today, 30) };
    const openLeads = ["lead_open", "lead_open_by_owner", "lead_open_stage_counts"];
    for (const [name, access] of [
      ["hot-travel-soon", manager],
      ["hot-travel-soon-mine", salesperson],
    ] as const) {
      const found = await plan(name, travelSoonQuery(access, window));
      expect(
        found.indexes.filter((index) => openLeads.includes(index)),
        found.text,
      ).not.toEqual([]);
    }
    for (const show of ["hot", "overdue", "uncontacted", "ai"] as const) {
      for (const view of ["mine", "everyone"] as const) {
        const input = listLeadsInput.parse({ view, show, page: 1, limit: 20 });
        const list = async (tx: OrgTx) =>
          listLeads(tx, manager, input, now, await leadsToShow(tx, manager, { view, show }, now));
        expect(await time(`show-${show}-${view}`, list), `${show} ${view}`).toBeLessThan(250);
      }
    }
    const waiting = await inOrg(async (tx) =>
      listLeads(
        tx,
        manager,
        listLeadsInput.parse({ show: "uncontacted", page: 1 }),
        now,
        await leadsToShow(tx, manager, { view: "mine", show: "uncontacted" }, now),
      ),
    );
    expect(waiting.total).toBe(3);
  });

  it("never scans lead, person, task, calls or chats from start to end", () => {
    const checked = [...plans].filter(([name]) => !name.startsWith("search-"));
    expect(checked.map(([name]) => name).sort()).toEqual(
      [
        "counts",
        "everyone-open",
        "hot-travel-soon",
        "hot-travel-soon-mine",
        "mine-open",
        "today-due-today",
        "today-due-today-count",
        "today-follow-ups-count",
        "today-new-leads",
        "today-new-leads-count",
        "today-overdue",
        "today-overdue-count",
      ].sort(),
    );
    for (const [name, found] of checked) {
      expect(
        found.seqScans.filter((table) => BIG_TABLES.includes(table)),
        `${name}: ${found.text}`,
      ).toEqual([]);
    }
  });
});
