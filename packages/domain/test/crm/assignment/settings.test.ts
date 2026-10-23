// The agency's assignment settings (release 4): read with the defaults, saved whole and audited with the full detail,
// the pool kept to exactly the people given, and the away switch with its audit entry.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import type { SaveAssignmentInput } from "@travel-crm/contracts/crm";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  chooseOwner,
  poolPlaceOf,
  readAssignment,
  saveAssignment,
  setAway,
} from "../../../src/crm/assignment/index.js";
import type { MemberAccess } from "../../../src/identity/index.js";
import { memberWithStarterRole } from "../../identity/rule-helpers.js";

const NOW = new Date("2026-10-23T05:00:00Z");

describe("the assignment settings", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  const [priya, ravi, meena] = [randomUUID(), randomUUID(), randomUUID()];
  const workers = new Set([priya, ravi, meena]);
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const auditOf = (action: string) =>
    inOrg((tx) => tx.auditEntry.findMany({ where: { action }, orderBy: { id: "asc" } }));
  const input = (overrides: Partial<SaveAssignmentInput> = {}): SaveAssignmentInput => ({
    mode: "turns",
    slowReplyMinutes: 15,
    workdays: 63,
    opensMinute: 600,
    closesMinute: 1140,
    rules: [],
    pool: [priya, ravi],
    ...overrides,
  });
  const save = (value: SaveAssignmentInput) => inOrg((tx) => saveAssignment(tx, manager, value, workers));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 4 });
    organizationId = await createTestOrganization(platform, "Assignment settings");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("reads the defaults before anything is saved: the Owner mode, Monday to Saturday 10:00 to 19:00, 15 minutes", async () => {
    expect(await inOrg((tx) => readAssignment(tx))).toEqual({
      mode: "owner",
      slowReplyMinutes: 15,
      workdays: 63,
      opensMinute: 600,
      closesMinute: 1140,
      rules: [],
      pool: [],
    });
  });

  it("saves the mode, the limit, the hours, the rules in order and the pool, and reads them back", async () => {
    const destinationId = await inOrg(async (tx) => (await tx.destination.create({ data: { name: "Kashmir" } })).id);
    await save(
      input({
        slowReplyMinutes: null,
        workdays: 0b0011111,
        opensMinute: 9 * 60 + 30,
        closesMinute: 18 * 60,
        rules: [
          { source: null, destinationId, tripType: null, assigneeUserId: meena },
          { source: "web_form", destinationId: null, tripType: "family", assigneeUserId: ravi },
        ],
      }),
    );
    const saved = await inOrg((tx) => readAssignment(tx));
    expect(saved).toMatchObject({
      mode: "turns",
      slowReplyMinutes: null,
      workdays: 31,
      opensMinute: 570,
      closesMinute: 1080,
    });
    expect(saved.rules.map((rule) => [rule.destinationName, rule.source, rule.assigneeUserId])).toEqual([
      ["Kashmir", null, meena],
      [null, "web_form", ravi],
    ]);
    expect(saved.pool.map((member) => member.userId).sort()).toEqual([priya, ravi].sort());
  });

  it("refuses a person who can't work leads, in the pool or in a rule, and saves nothing", async () => {
    const stranger = randomUUID();
    await expect(save(input({ pool: [priya, stranger] }))).rejects.toMatchObject({ reason: "NOT_A_LEAD_WORKER" });
    await expect(
      save(input({ rules: [{ source: "web_form", destinationId: null, tripType: null, assigneeUserId: stranger }] })),
    ).rejects.toMatchObject({ reason: "NOT_A_LEAD_WORKER" });
  });

  it("keeps the audit detail: mode, limit, hours, the pool's user ids and each rule's fields, before and after", async () => {
    const before = (await auditOf("assignment.updated")).length;
    await save(
      input({
        mode: "fewest_open",
        pool: [ravi, meena],
        rules: [{ source: "whatsapp", destinationId: null, tripType: null, assigneeUserId: priya }],
      }),
    );
    const entries = await auditOf("assignment.updated");
    expect(entries).toHaveLength(before + 1);
    const entry = entries.at(-1);
    expect(entry?.after).toEqual({
      mode: "fewest_open",
      slowReplyMinutes: 15,
      workdays: 63,
      opensMinute: 600,
      closesMinute: 1140,
      rules: [{ source: "whatsapp", destinationId: null, tripType: null, assigneeUserId: priya }],
      pool: [ravi, meena].sort(),
    });
    expect(entry?.before).toMatchObject({ pool: expect.arrayContaining([ravi]) as unknown });
  });

  it("removes a pool row for someone no longer given, keeping the away state and the turn of those who stay", async () => {
    await save(input({ pool: [priya, ravi] }));
    const awayUntil = new Date("2026-12-01T00:00:00Z");
    await inOrg((tx) => tx.assignmentPoolMember.updateMany({ where: { userId: ravi }, data: { awayUntil } }));
    await save(input({ pool: [ravi] }));
    const pool = await inOrg((tx) => tx.assignmentPoolMember.findMany());
    expect(pool.map((member) => member.userId)).toEqual([ravi]);
    expect(pool[0]?.awayUntil).toEqual(awayUntil);
  });

  it("keeps the rule list from growing on a repeated save", async () => {
    const rule = { source: "web_form" as const, destinationId: null, tripType: null, assigneeUserId: priya };
    await save(input({ rules: [rule] }));
    await save(input({ rules: [rule] }));
    expect((await inOrg((tx) => readAssignment(tx))).rules).toHaveLength(1);
  });

  it("waits for a lead being given out rather than deadlocking with it", async () => {
    await save(input({ mode: "turns", pool: [priya, ravi] }));
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => undefined;
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const choosing = inOrg(async (tx) => {
      await chooseOwner(
        tx,
        { source: "web_form", destinationId: null, tripType: null, previousOwnerUserId: null },
        {
          workers,
          fallback: meena,
          now: NOW,
        },
      );
      locked();
      await held;
    });
    await isLocked;
    let saved = false;
    const saving = save(input({ mode: "turns", pool: [ravi] })).then(() => {
      saved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(saved).toBe(false);
    release();
    await Promise.all([choosing, saving]);
    expect(saved).toBe(true);
  });

  describe("the away switch", () => {
    it("marks the person away and back, and audits each", async () => {
      await save(input({ pool: [priya, ravi] }));
      const self = memberWithStarterRole("sales", { organizationId, userId: priya });
      const until = new Date("2026-10-26T05:00:00Z").toISOString();
      const entries = (await auditOf("assignment.away-set")).length;
      await inOrg((tx) => setAway(tx, self, { awayUntil: until }));
      expect(await inOrg((tx) => poolPlaceOf(tx, self))).toEqual({ inPool: true, awayUntil: until });
      await inOrg((tx) => setAway(tx, self, { awayUntil: null }));
      expect(await inOrg((tx) => poolPlaceOf(tx, self))).toEqual({ inPool: true, awayUntil: null });
      const audited = (await auditOf("assignment.away-set")).slice(entries);
      expect(audited.map((entry) => [entry.actorUserId, entry.after])).toEqual([
        [priya, { awayUntil: until }],
        [priya, { awayUntil: null }],
      ]);
    });

    it("tells someone outside the pool so, and audits nothing", async () => {
      const outsider = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
      const entries = (await auditOf("assignment.away-set")).length;
      await expect(inOrg((tx) => setAway(tx, outsider, { awayUntil: null }))).rejects.toMatchObject({
        reason: "NOT_IN_POOL",
      });
      expect(await auditOf("assignment.away-set")).toHaveLength(entries);
    });
  });
});
