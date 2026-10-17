// The lead list and its counts (spec 3.3; R5, R35): Mine · open by default, newest first a page at a time; a
// salesperson only ever sees their own leads; managers filter everyone's; the search forgives typos in names and finds
// any four or more digits of a phone; and each row says what's next.
import { randomUUID } from "node:crypto";
import { listLeadsInput, leadCountsInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { countLeads, listLeads } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, aPerson, aTask, type LeadSeed } from "./support/records.js";

describe("the lead list", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const list = (access: MemberAccess, input: Record<string, unknown> = {}) =>
    inOrg((tx) => listLeads(tx, access, listLeadsInput.parse(input)));
  const ids = async (access: MemberAccess, input: Record<string, unknown> = {}) =>
    (await list(access, input)).items.map((item) => item.id);
  const counts = (access: MemberAccess, input: Record<string, unknown> = {}) =>
    inOrg((tx) => countLeads(tx, access, leadCountsInput.parse(input)));
  /** Leads for one owner, each for a new person named as given. */
  const leadsOf = (ownerUserId: string, seeds: (LeadSeed & { name?: string; phone?: string })[]) =>
    inOrg(async (tx) => {
      const made: string[] = [];
      for (const { name, phone, ...seed } of seeds) {
        const person = await aPerson(tx, { ...(name ? { name } : {}), ...(phone ? { phoneE164: phone } : {}) });
        made.push((await aLead(tx, { ownerUserId, personId: person.id, ...seed })).id);
      }
      return made;
    });
  const newestFirst = (leadIds: string[]) => [...leadIds].reverse();

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Lead list");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("lists Mine · open newest first, 25 a page, with a cursor", async () => {
    const open = await leadsOf(
      salesperson.userId,
      Array.from({ length: 26 }, () => ({ stage: "contacted" as const })),
    );
    await leadsOf(salesperson.userId, [{ stage: "lost" }]);
    const first = await list(salesperson);
    expect(first.items).toHaveLength(25);
    expect(first.items.map((item) => item.id)).toEqual(newestFirst(open).slice(0, 25));
    expect(first.nextCursor).toBe(first.items.at(-1)?.id);
    const second = await list(salesperson, { before: first.nextCursor });
    expect(second).toEqual({ items: [expect.objectContaining({ id: open[0] })], nextCursor: null });
  });

  it("shows a salesperson only their own leads, whatever view or owner they send", async () => {
    const asha = randomUUID();
    const theirs = await leadsOf(asha, [{}, { stage: "lost" }]);
    for (const input of [{}, { view: "everyone" }, { view: "everyone", ownerUserId: asha }, { stage: "lost" }]) {
      const items = (await list(salesperson, input)).items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((item) => item.ownerUserId === salesperson.userId)).toBe(true);
      for (const lead of theirs) expect(items.map((item) => item.id)).not.toContain(lead);
    }
    expect((await counts(salesperson, { view: "everyone", ownerUserId: asha })).open).toBe(
      (await counts(salesperson)).open,
    );
  });

  it("lists everyone's for a manager, filtered by owner, source, destination, trip type or a closed stage", async () => {
    const [ravi, meena] = [randomUUID(), randomUUID()];
    const goa = await inOrg((tx) => tx.destination.create({ data: { name: "Goa" } }));
    const [raviNew, raviReferral, raviGoa] = await leadsOf(ravi, [
      {},
      { source: "referral" },
      { destinationId: goa.id, tripType: "honeymoon" },
    ]);
    const [meenaOpen, meenaWon] = await leadsOf(meena, [{ stage: "quote_sent" }, { stage: "won" }]);
    expect(await ids(manager)).toEqual([]);
    const everyone = await ids(manager, { view: "everyone" });
    expect(everyone).toEqual(expect.arrayContaining([raviNew, raviReferral, raviGoa, meenaOpen]));
    expect(everyone).not.toContain(meenaWon);
    expect(await ids(manager, { view: "everyone", ownerUserId: ravi })).toEqual([raviGoa, raviReferral, raviNew]);
    expect(await ids(manager, { view: "everyone", ownerUserId: ravi, source: "referral" })).toEqual([raviReferral]);
    expect(await ids(manager, { view: "everyone", destinationId: goa.id })).toEqual([raviGoa]);
    expect(await ids(manager, { view: "everyone", ownerUserId: ravi, tripType: "honeymoon" })).toEqual([raviGoa]);
    expect(await ids(manager, { view: "everyone", ownerUserId: meena, stage: "won" })).toEqual([meenaWon]);
    expect(await ids(manager, { view: "mine", ownerUserId: meena })).toEqual([]);
  });

  it("leaves Not a lead out of the default list", async () => {
    const owner = randomUUID();
    const [open, notALead] = await leadsOf(owner, [{ stage: "booking_requested" }, { stage: "not_a_lead" }]);
    expect(await ids(manager, { view: "everyone", ownerUserId: owner })).toEqual([open]);
    expect(await ids(manager, { view: "everyone", ownerUserId: owner, stage: "not_a_lead" })).toEqual([notALead]);
  });

  // A lone misspelt word ("shrma", word similarity 0.44) sits below pg_trgm's default threshold (0.6), which only a
  // database setting may lower: see the track's ruling.
  it("finds Rahul Sharma by 'Rahul Shrma', and Priya Patel by 'priya patl'", async () => {
    const owner = randomUUID();
    const [rahul, priya] = await leadsOf(owner, [{ name: "Rahul Sharma" }, { name: "Priya Patel" }]);
    const search = (text: string) => ids(manager, { view: "everyone", ownerUserId: owner, search: text });
    expect(await search("Rahul Shrma")).toEqual([rahul]);
    expect(await search("priya patl")).toEqual([priya]);
    expect(await search("sharma")).toEqual([rahul]);
    expect(await search("Mehta")).toEqual([]);
  });

  it("finds a lead by any four or more digits of the phone", async () => {
    const owner = randomUUID();
    const [rahul] = await leadsOf(owner, [{ phone: "+919876543210" }, { phone: "+919123400000" }]);
    const search = (text: string) => ids(manager, { view: "everyone", ownerUserId: owner, search: text });
    for (const typed of ["98765", "43 210", "+91 98765 43210", "098765-43210", "6543"]) {
      expect(await search(typed)).toEqual([rahul]);
    }
    expect(await search("55555")).toEqual([]);
  });

  it("counts a search's digits as typed, so a leading zero still makes it a phone search", async () => {
    const owner = randomUUID();
    const [rahul, zeros] = await leadsOf(owner, [{ phone: "+919876512345" }, { phone: "+919123500000" }]);
    const search = (text: string) => ids(manager, { view: "everyone", ownerUserId: owner, search: text });
    expect(await search("0987")).toEqual([rahul]);
    expect(await search("0000")).toEqual([zeros]);
  });

  it("finds राहुल शर्मा by राहुल", async () => {
    const owner = randomUUID();
    const [rahul] = await leadsOf(owner, [{ name: "राहुल शर्मा" }, { name: "प्रिया पटेल" }]);
    expect(await ids(manager, { view: "everyone", ownerUserId: owner, search: "राहुल" })).toEqual([rahul]);
  });

  it("treats % and _ in a search as letters", async () => {
    const owner = randomUUID();
    const [underscore, , percent] = await leadsOf(owner, [
      { name: "rahul_k" },
      { name: "Rahul Kumar" },
      { name: "Tour 50% off" },
      { name: "Tour 500 off" },
    ]);
    const search = (text: string) => ids(manager, { view: "everyone", ownerUserId: owner, search: text });
    expect(await search("l_k")).toEqual([underscore]);
    expect(await search("0%")).toEqual([percent]);
  });

  it("gives each row its next step: waiting since it came, or its earliest open task", async () => {
    const owner = randomUUID();
    const came = new Date("2026-10-16T04:30:00Z");
    const [waiting = "", working = "", both = ""] = await leadsOf(owner, [
      { createdAt: came },
      { stage: "contacted" },
      { createdAt: came },
    ]);
    const due = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
    const soon = due(1);
    const on = (leadId: string) => ({ recordType: "lead", recordId: leadId });
    const earliest = await inOrg(async (tx) => {
      await aTask(tx, { kind: "follow-up", record: on(working), dueAt: due(5), assigneeUserId: owner });
      await aTask(tx, {
        kind: "follow-up",
        record: on(working),
        dueAt: due(-2),
        doneAt: new Date(),
        assigneeUserId: owner,
      });
      const first = await aTask(tx, { kind: "follow-up", title: "Send the quote", record: on(working), dueAt: soon });
      await aTask(tx, { record: on(both), dueAt: due(3), assigneeUserId: owner });
      return first;
    });
    const page = await list(manager, { view: "everyone", ownerUserId: owner });
    const items = new Map(page.items.map((item) => [item.id, item]));
    expect(items.get(waiting)?.next).toEqual({ awaitingReplySince: came.toISOString(), task: null });
    expect(items.get(working)?.next).toEqual({
      awaitingReplySince: null,
      task: { id: earliest.id, kind: "follow-up", title: "Send the quote", dueAt: soon.toISOString() },
    });
    expect(items.get(both)?.next).toMatchObject({ awaitingReplySince: came.toISOString(), task: { kind: "task" } });
  });

  it("reads each row's person, trip and budget", async () => {
    const owner = randomUUID();
    const kerala = await inOrg((tx) => tx.destination.create({ data: { name: "Kerala" } }));
    const [lead] = await leadsOf(owner, [
      {
        name: "Neha Iyer",
        phone: "+919800012345",
        destinationId: kerala.id,
        travelKind: "month",
        travelMonth: new Date("2026-12-01T00:00:00Z"),
        adults: 2,
        childrenAges: [5],
        budgetPaise: 18_000_000n,
        budgetBasis: "for_everyone",
        returning: true,
        source: "instagram",
      },
    ]);
    const [item] = (await list(manager, { view: "everyone", ownerUserId: owner })).items;
    expect(item).toMatchObject({
      id: lead,
      person: { name: "Neha Iyer", phone: "+919800012345" },
      returning: true,
      stage: "new",
      trip: { destinationName: "Kerala", when: { kind: "month", month: "2026-12" }, adults: 2, childrenCount: 1 },
      source: "instagram",
      ownerUserId: owner,
      budget: { amount: { amountPaise: 18_000_000, currency: "INR" }, basis: "for_everyone" },
    });
  });

  it("counts open leads by stage for the same view and filters", async () => {
    const owner = randomUUID();
    await leadsOf(owner, [
      {},
      { source: "referral" },
      { stage: "contacted" },
      { stage: "quote_sent", source: "referral" },
      { stage: "won" },
      { stage: "not_a_lead" },
    ]);
    expect(await counts(manager, { view: "everyone", ownerUserId: owner })).toEqual({
      open: 4,
      new: 2,
      contacted: 1,
      quote_sent: 1,
      booking_requested: 0,
    });
    expect(await counts(manager, { view: "everyone", ownerUserId: owner, source: "referral" })).toEqual({
      open: 2,
      new: 1,
      contacted: 0,
      quote_sent: 1,
      booking_requested: 0,
    });
    expect(await counts(manager)).toEqual({ open: 0, new: 0, contacted: 0, quote_sent: 0, booking_requested: 0 });
  });

  it("keeps a salesperson's search to their own leads, by name or by digits", async () => {
    const asha = randomUUID();
    const [mine] = await leadsOf(salesperson.userId, [{ name: "Kavya Menon", phone: "+919845011111" }]);
    const [theirs] = await leadsOf(asha, [{ name: "Kavya Menon", phone: "+919845022222" }]);
    for (const search of ["Kavya", "Kavya Menn", "98450"]) {
      for (const view of [{}, { view: "everyone" }, { view: "everyone", ownerUserId: asha }]) {
        expect(await ids(salesperson, { ...view, search })).toEqual([mine]);
        expect((await counts(salesperson, { ...view, search })).open).toBe(1);
      }
    }
    expect(await ids(manager, { view: "everyone", search: "98450" })).toEqual([theirs, mine]);
  });

  it("pages a filtered, searched list with no duplicates and no gaps", async () => {
    const owner = randomUUID();
    const made = await leadsOf(
      owner,
      Array.from({ length: 15 }, (_, index) => ({
        name: index % 5 === 4 ? `Other ${String(index)}` : `Meera ${String(index)}`,
        source: index % 3 === 0 ? "walk_in" : "referral",
      })),
    );
    const wanted = newestFirst(made.filter((_, index) => index % 3 !== 0 && index % 5 !== 4));
    const filter = { view: "everyone", ownerUserId: owner, source: "referral", search: "Meera", limit: 3 };
    const seen: string[] = [];
    let before: string | null | undefined;
    do {
      const page = await list(manager, { ...filter, ...(before ? { before } : {}) });
      seen.push(...page.items.map((item) => item.id));
      before = page.nextCursor;
    } while (before !== null);
    expect(seen).toEqual(wanted);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
