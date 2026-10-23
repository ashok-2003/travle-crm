// Who a lead that arrives by itself goes to (release 4, spec 4.2 to 4.4): every step and its order, "away" skipping
// people only in the turns, an empty pool leaving the lead Unassigned, the fewest-open ties, and twenty arrivals at
// once splitting fairly.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import type { AssignmentMode } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { chooseOwner, type AssignContext, type LeadFacts } from "../../../src/crm/assignment/index.js";
import { aLead } from "../support/records.js";

const NOW = new Date("2026-10-23T05:00:00Z");
const IN_A_DAY = new Date("2026-10-24T05:00:00Z");
const A_DAY_AGO = new Date("2026-10-22T05:00:00Z");
const facts = (overrides: Partial<LeadFacts> = {}): LeadFacts => ({
  source: "web_form",
  destinationId: null,
  tripType: null,
  previousOwnerUserId: null,
  ...overrides,
});

describe("choosing an owner", () => {
  let platform: PlatformClient;
  let db: Database;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 24 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  /** An agency with the people given in its pool (in this order of joining) and the fallback Owner. */
  async function agency(mode: AssignmentMode, pool: { away?: Date; lastTurn?: Date; leftTheAgency?: true }[] = []) {
    const organizationId = await createTestOrganization(platform, "Assignment");
    const owner = randomUUID();
    const people = pool.map((member) => ({ ...member, userId: randomUUID() }));
    await db.forOrg(organizationId, async (tx) => {
      await tx.assignmentSettings.create({ data: { mode } });
      for (const person of people) {
        await tx.assignmentPoolMember.create({
          data: { userId: person.userId, awayUntil: person.away ?? null, lastAssignedAt: person.lastTurn ?? null },
        });
      }
    });
    const workers = new Set([owner, ...people.filter((person) => !person.leftTheAgency).map((p) => p.userId)]);
    const context: AssignContext = { workers, fallback: owner, now: NOW };
    const choose = (lead: LeadFacts = facts(), tweak: Partial<AssignContext> = {}) =>
      db.forOrg(organizationId, (tx) => chooseOwner(tx, lead, { ...context, ...tweak }));
    const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => db.forOrg(organizationId, work);
    return { organizationId, owner, people: people.map((person) => person.userId), choose, inOrg, context };
  }

  describe("the order of the checks", () => {
    it("gives a returning customer to their previous owner before any rule or mode", async () => {
      const { choose, people, inOrg, owner } = await agency("turns", [{}, {}]);
      await inOrg((tx) =>
        tx.assignmentRule.create({ data: { position: 0, source: "web_form", assigneeUserId: owner } }),
      );
      expect(await choose(facts({ previousOwnerUserId: people[1] ?? "" }))).toEqual({
        userId: people[1],
        reason: "returning",
        rulePosition: null,
        away: false,
      });
    });

    it("tries the rules in position order, the first whose set conditions all match", async () => {
      const { choose, people, inOrg } = await agency("owner", [{}, {}, {}]);
      await inOrg(async (tx) => {
        await tx.assignmentRule.createMany({
          data: [
            { position: 2, source: "web_form", assigneeUserId: people[2] ?? "" },
            { position: 0, source: "web_form", tripType: "honeymoon", assigneeUserId: people[0] ?? "" },
            { position: 1, source: "web_form", assigneeUserId: people[1] ?? "" },
          ],
        });
      });
      expect(await choose(facts({ tripType: "family" }))).toMatchObject({
        userId: people[1],
        reason: "rule",
        rulePosition: 1,
      });
      expect(await choose(facts({ tripType: "honeymoon" }))).toMatchObject({
        userId: people[0],
        reason: "rule",
        rulePosition: 0,
      });
      expect(await choose(facts({ source: "whatsapp" }))).toMatchObject({ reason: "owner" });
    });

    it("matches a destination condition on the lead's destination", async () => {
      const { choose, people, inOrg } = await agency("owner", [{}]);
      const destinationId = await inOrg(async (tx) => (await tx.destination.create({ data: { name: "Kashmir" } })).id);
      await inOrg((tx) =>
        tx.assignmentRule.create({ data: { position: 0, destinationId, assigneeUserId: people[0] ?? "" } }),
      );
      expect(await choose(facts({ destinationId }))).toMatchObject({ userId: people[0], reason: "rule" });
      expect(await choose(facts({ destinationId: randomUUID() }))).toMatchObject({ reason: "owner" });
    });

    it("passes over a previous owner who left, and a rule whose person left, to the next step", async () => {
      const { choose, people, inOrg, owner } = await agency("owner", [{ leftTheAgency: true }, {}]);
      await inOrg(async (tx) => {
        await tx.assignmentRule.createMany({
          data: [
            { position: 0, source: "web_form", assigneeUserId: people[0] ?? "" },
            { position: 1, source: "web_form", assigneeUserId: people[1] ?? "" },
          ],
        });
      });
      expect(await choose(facts({ previousOwnerUserId: people[0] ?? "" }))).toMatchObject({
        userId: people[1],
        rulePosition: 1,
      });
      await inOrg((tx) => tx.assignmentRule.deleteMany({ where: { position: 1 } }));
      expect(await choose(facts({ previousOwnerUserId: people[0] ?? "" }))).toMatchObject({
        userId: owner,
        reason: "owner",
      });
    });

    it("gives everything to the Owner in the Owner mode, with no settings row at all", async () => {
      const { choose, owner } = await agency("owner");
      expect(await choose()).toEqual({ userId: owner, reason: "owner", rulePosition: null, away: false });
      const organizationId = await createTestOrganization(platform, "No settings");
      const result = await db.forOrg(organizationId, (tx) =>
        chooseOwner(tx, facts(), { workers: new Set([owner]), fallback: owner, now: NOW }),
      );
      expect(result).toMatchObject({ userId: owner, reason: "owner" });
    });
  });

  describe("away", () => {
    it("is ignored for a returning customer's previous owner and a rule's person, and the answer says so", async () => {
      const { choose, people, inOrg } = await agency("turns", [{ away: IN_A_DAY }, { away: IN_A_DAY }, {}]);
      expect(await choose(facts({ previousOwnerUserId: people[0] ?? "" }))).toEqual({
        userId: people[0],
        reason: "returning",
        rulePosition: null,
        away: true,
      });
      await inOrg((tx) =>
        tx.assignmentRule.create({ data: { position: 3, source: "web_form", assigneeUserId: people[1] ?? "" } }),
      );
      expect(await choose()).toEqual({ userId: people[1], reason: "rule", rulePosition: 3, away: true });
    });

    it("does not count when it has ended", async () => {
      const { choose, people } = await agency("turns", [{ away: A_DAY_AGO }]);
      expect(await choose(facts({ previousOwnerUserId: people[0] ?? "" }))).toMatchObject({ away: false });
    });

    it("gives the Owner the lead in the Owner mode even when the Owner is away in the pool", async () => {
      const { choose, owner, inOrg } = await agency("owner");
      await inOrg((tx) => tx.assignmentPoolMember.create({ data: { userId: owner, awayUntil: IN_A_DAY } }));
      expect(await choose()).toEqual({ userId: owner, reason: "owner", rulePosition: null, away: true });
    });

    it("skips anyone away in the turns, and in fewest open", async () => {
      for (const mode of ["turns", "fewest_open"] as const) {
        const { choose, people } = await agency(mode, [{ away: IN_A_DAY }, {}]);
        expect(await choose()).toMatchObject({ userId: people[1], reason: mode, away: false });
        expect(await choose()).toMatchObject({ userId: people[1] });
      }
    });

    it("leaves the lead Unassigned when everyone in the pool is away, gone, or the pool is empty", async () => {
      const none = { userId: null, reason: "none", rulePosition: null, away: false };
      expect(await (await agency("turns", [{ away: IN_A_DAY }, { away: IN_A_DAY }])).choose()).toEqual(none);
      expect(await (await agency("turns", [{ leftTheAgency: true }])).choose()).toEqual(none);
      expect(await (await agency("turns")).choose()).toEqual(none);
      expect(await (await agency("fewest_open")).choose()).toEqual(none);
    });
  });

  describe("taking turns", () => {
    it("goes round the pool: never-had-a-turn first, then the longest ago", async () => {
      const { choose, people } = await agency("turns", [
        { lastTurn: A_DAY_AGO },
        {},
        { lastTurn: new Date("2026-10-21T05:00:00Z") },
      ]);
      const given: (string | null)[] = [];
      for (let lead = 0; lead < 6; lead += 1) given.push((await choose()).userId);
      expect(given).toEqual([people[1], people[2], people[0], people[1], people[2], people[0]]);
    });

    it("breaks a tie on the member's id, so the pool's order of joining", async () => {
      const { choose, people } = await agency("turns", [{}, {}, {}]);
      expect([(await choose()).userId, (await choose()).userId, (await choose()).userId]).toEqual(people);
    });

    it("stamps the turn with the database's clock, not the lead's time", async () => {
      const { choose, people, inOrg } = await agency("turns", [{}, {}]);
      const before = Date.now();
      await choose(facts(), { now: new Date("2020-01-01T00:00:00Z") });
      const stamped = await inOrg((tx) =>
        tx.assignmentPoolMember.findFirstOrThrow({ where: { userId: people[0] ?? "" } }),
      );
      expect(stamped.lastAssignedAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect((await choose()).userId).toBe(people[1]);
    });
  });

  describe("fewest open leads", () => {
    it("gives the lead to the person with the fewest open leads, counting only the open stages", async () => {
      const { choose, people, inOrg } = await agency("fewest_open", [{}, {}, {}]);
      await inOrg(async (tx) => {
        await aLead(tx, { ownerUserId: people[0] ?? "" });
        await aLead(tx, { ownerUserId: people[0] ?? "", stage: "quote_sent" });
        await aLead(tx, { ownerUserId: people[1] ?? "" });
        for (const stage of ["won", "lost", "not_a_lead"] as const)
          await aLead(tx, { ownerUserId: people[2] ?? "", stage });
      });
      expect(await choose()).toMatchObject({ userId: people[2], reason: "fewest_open" });
    });

    it("breaks a tie on the oldest turn", async () => {
      const { choose, people } = await agency("fewest_open", [
        { lastTurn: new Date("2026-10-22T05:00:00Z") },
        { lastTurn: new Date("2026-10-21T05:00:00Z") },
        { lastTurn: new Date("2026-10-22T09:00:00Z") },
      ]);
      expect((await choose()).userId).toBe(people[1]);
    });
  });

  describe("twenty arrivals at once", () => {
    const arrivals = 20;

    async function arriveTogether(mode: "turns" | "fewest_open") {
      const { organizationId, people, context } = await agency(mode, [{}, {}, {}, {}]);
      const owners = await Promise.all(
        Array.from({ length: arrivals }, () =>
          db.forOrg(organizationId, async (tx) => {
            const { userId } = await chooseOwner(tx, facts(), context);
            await aLead(tx, { ownerUserId: userId });
            return userId;
          }),
        ),
      );
      return { people, owners };
    }

    it.each(["turns", "fewest_open"] as const)("split fairly over a pool of four in %s", async (mode) => {
      const { people, owners } = await arriveTogether(mode);
      for (const person of people)
        expect(owners.filter((owner) => owner === person)).toHaveLength(arrivals / people.length);
    });
  });
});
