// A large agency stays fast (spec 7, ADR 0028): with 50,000 leads, 100,000 tasks and 500 staff, the lead list, its
// counts, search and Today answer within their time budgets, and the list, the counts and Today read their partial
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
import { countLeads, leadCountsQuery, leadListQuery, listLeads, newLeadsWaitingQuery } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { openTasksQuery } from "../../src/tasks/index.js";
import { todaySummary } from "../../src/today/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { seedLargeAgency } from "./large-agency.js";
import { medianMs, planOf, type QueryPlan } from "./query-plans.js";

const SIZE = { leads: 50_000, tasks: 100_000, staff: 500, destinations: 300 };
const NEIGHBOUR = { leads: 100_000, tasks: 0, staff: 500, destinations: 300 };
const BIG_TABLES = ["lead", "person", "task"];

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
    const ms = await medianMs(() => inOrg(run));
    timings.set(name, ms);
    return ms;
  };

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Large agency");
    const { ownerUserIds } = await seedLargeAgency(platform, isolated.urls, organizationId, SIZE);
    // Agencies share the database: one seeded after this one, so its rows are newer than all of this agency's.
    const neighbour = await createTestOrganization(platform, "Neighbouring agency");
    await seedLargeAgency(platform, isolated.urls, neighbour, NEIGHBOUR);
    const userId = ownerUserIds[0] ?? "";
    salesperson = memberWithStarterRole("sales", { organizationId, userId });
    manager = memberWithStarterRole("org-admin", { organizationId, userId });
  }, 300_000);

  afterAll(async () => {
    // One line for the record: each query's median and the indexes its plan read (a failure prints the whole plan).
    const indexes = Object.fromEntries([...plans].map(([name, found]) => [name, found.indexes]));
    const medians = Object.fromEntries([...timings].map(([name, ms]) => [name, Math.round(ms * 10) / 10]));
    console.info("Large agency:", JSON.stringify({ medians, indexes }));
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

  it("counts open leads by stage within 150 ms, on lead_open_stage_counts", async () => {
    expect((await plan("counts", leadCountsQuery({ ownerUserId: null }))).indexes).toContain("lead_open_stage_counts");
    const input = leadCountsInput.parse({ view: "everyone" });
    const counts = await inOrg((tx) => countLeads(tx, manager, input));
    expect(counts.open).toBe(SIZE.leads / 2);
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

  it("builds Today within 150 ms, on task_open_by_assignee and lead_new_by_owner", async () => {
    const now = new Date();
    const overdue = openTasksQuery({ assigneeUserId: salesperson.userId, dueBefore: now, limit: 21 });
    expect((await plan("today-overdue", overdue)).indexes).toContain("task_open_by_assignee");
    const newLeads = newLeadsWaitingQuery({ ownerUserId: salesperson.userId, limit: 21 });
    expect((await plan("today-new-leads", newLeads)).indexes).toContain("lead_new_by_owner");
    const summary = await inOrg((tx) => todaySummary(tx, salesperson, now));
    expect(summary.counts.newLeads).toBe(SIZE.leads / 10 / SIZE.staff);
    expect(summary.counts.overdue).toBeGreaterThan(0);
    expect(await time("today", (tx) => todaySummary(tx, salesperson, now))).toBeLessThan(150);
  });

  it("never scans lead, person or task from start to end", () => {
    const checked = [...plans].filter(([name]) => !name.startsWith("search-"));
    expect(checked.map(([name]) => name).sort()).toEqual(
      ["counts", "everyone-open", "mine-open", "today-new-leads", "today-overdue"].sort(),
    );
    for (const [name, found] of checked) {
      expect(
        found.seqScans.filter((table) => BIG_TABLES.includes(table)),
        `${name}: ${found.text}`,
      ).toEqual([]);
    }
  });
});
