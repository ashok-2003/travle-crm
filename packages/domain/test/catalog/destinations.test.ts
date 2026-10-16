// Destinations (spec 3.2, 3.6): the agency's own list, found by name whatever its case, added once when two saves race,
// renamed without clashing, and merged so leads, repeat enquiries and later typing all land on the one kept (R34).
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  destinationById,
  destinationNames,
  findOrAddDestination,
  renameDestination,
  searchDestinations,
} from "../../src/catalog/index.js";
import { mergeDestinations } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { aLead } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { backendPid, waitUntilBlockedBy } from "../lock-waits.js";

describe("destinations", () => {
  let platform: PlatformClient;
  let db: Database;
  let owner: MemberAccess;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(owner.organizationId, work);
  const auditActions = (entityId: string) =>
    inOrg(async (tx) =>
      (await tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } })).map((entry) => entry.action),
    );

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 4 });
    const organizationId = await createTestOrganization(platform, "Destinations");
    owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("finds 'goa' as Goa, and adds Kashmir once when two saves race", async () => {
    const goa = await inOrg((tx) => findOrAddDestination(tx, owner, "Goa"));
    expect(goa.name).toBe("Goa");
    expect(await inOrg((tx) => findOrAddDestination(tx, owner, "goa"))).toEqual(goa);
    expect(await auditActions(goa.id)).toEqual(["destination.added"]);

    let release: () => void = () => undefined;
    const mayCommit = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstAdded: (holder: number) => void = () => undefined;
    const added = new Promise<number>((resolve) => {
      firstAdded = resolve;
    });
    const first = inOrg(async (tx) => {
      const kashmir = await findOrAddDestination(tx, owner, "Kashmir");
      firstAdded(await backendPid(tx));
      await mayCommit;
      return kashmir;
    });
    const holder = await added;
    const second = inOrg((tx) => findOrAddDestination(tx, owner, "kashmir"));
    await waitUntilBlockedBy(platform, holder);
    release();
    const [kept, found] = await Promise.all([first, second]);
    expect(found).toEqual(kept);
    expect(await inOrg((tx) => searchDestinations(tx, { query: "kashmir", limit: 20 }))).toEqual([kept]);
    expect(await auditActions(kept.id)).toEqual(["destination.added"]);
  });

  it("resolves a merged destination's name to the one it was merged into", async () => {
    const srinagar = await inOrg((tx) => findOrAddDestination(tx, owner, "Srinagar"));
    const kashmir = await inOrg((tx) => findOrAddDestination(tx, owner, "Kashmir Valley"));
    await inOrg((tx) => mergeDestinations(tx, owner, { destinationId: srinagar.id, intoDestinationId: kashmir.id }));
    expect(await inOrg((tx) => findOrAddDestination(tx, owner, "SRINAGAR"))).toEqual(kashmir);
    expect(await inOrg((tx) => destinationById(tx, srinagar.id))).toEqual(kashmir);
    expect(await inOrg((tx) => destinationNames(tx, [srinagar.id, kashmir.id]))).toEqual(
      new Map([
        [srinagar.id, "Srinagar"],
        [kashmir.id, "Kashmir Valley"],
      ]),
    );
  });

  it("refuses a rename to a live name in any case: DESTINATION_NAME_TAKEN", async () => {
    const manali = await inOrg((tx) => findOrAddDestination(tx, owner, "Manali"));
    const shimla = await inOrg((tx) => findOrAddDestination(tx, owner, "Shimla"));
    await expect(
      inOrg((tx) => renameDestination(tx, owner, { destinationId: shimla.id, name: "MANALI" })),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "DESTINATION_NAME_TAKEN" });
    await inOrg((tx) => renameDestination(tx, owner, { destinationId: manali.id, name: "manali" }));
    expect(await inOrg((tx) => destinationById(tx, manali.id))).toEqual({ id: manali.id, name: "manali" });
    expect(await auditActions(manali.id)).toEqual(["destination.added", "destination.renamed"]);
    await expect(
      inOrg((tx) => renameDestination(tx, owner, { destinationId: randomUUID(), name: "Leh" })),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "NOT_FOUND" });
  });

  it("merges: leads and repeat enquiries move, the old one is gone from search", async () => {
    const ladakh = await inOrg((tx) => findOrAddDestination(tx, owner, "Ladakh"));
    const leh = await inOrg((tx) => findOrAddDestination(tx, owner, "Leh Ladakh"));
    const leads = await inOrg(async (tx) => {
      const one = await aLead(tx, { destinationId: leh.id });
      const two = await aLead(tx, { destinationId: leh.id });
      await tx.leadEnquiry.create({ data: { leadId: one.id, source: "referral", destinationId: leh.id } });
      return [one, two];
    });
    await expect(
      inOrg((tx) => mergeDestinations(tx, owner, { destinationId: leh.id, intoDestinationId: leh.id })),
    ).rejects.toMatchObject({ reason: "MERGE_INTO_ITSELF" });

    const merged = await inOrg((tx) =>
      mergeDestinations(tx, owner, { destinationId: leh.id, intoDestinationId: ladakh.id }),
    );
    expect(merged).toEqual({ leadsMoved: 2 });
    const moved = await inOrg(async (tx) => ({
      leads: await tx.lead.findMany({ where: { id: { in: leads.map((lead) => lead.id) } } }),
      enquiries: await tx.leadEnquiry.findMany({ where: { leadId: { in: leads.map((lead) => lead.id) } } }),
    }));
    expect(moved.leads.map((lead) => lead.destinationId)).toEqual([ladakh.id, ladakh.id]);
    expect(moved.enquiries.map((enquiry) => enquiry.destinationId)).toEqual([ladakh.id]);
    expect(await inOrg((tx) => searchDestinations(tx, { query: "ladakh", limit: 20 }))).toEqual([ladakh]);
    expect(await auditActions(leh.id)).toEqual(["destination.added", "destination.merged"]);
    await expect(
      inOrg((tx) => mergeDestinations(tx, owner, { destinationId: leh.id, intoDestinationId: ladakh.id })),
    ).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });

  it("searches live destinations alphabetically, forgiving a typo", async () => {
    const names = await inOrg(async (tx) => {
      for (const name of ["Rishikesh", "Andaman", "Kerala"]) await findOrAddDestination(tx, owner, name);
      return (await searchDestinations(tx, { limit: 100 })).map((found) => found.name);
    });
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en-IN", { sensitivity: "base" })));
    expect(await inOrg((tx) => searchDestinations(tx, { query: "Rishikes", limit: 5 }))).toMatchObject([
      { name: "Rishikesh" },
    ]);
    expect(await inOrg((tx) => searchDestinations(tx, { query: "Andamn", limit: 5 }))).toMatchObject([
      { name: "Andaman" },
    ]);
    expect(await inOrg((tx) => searchDestinations(tx, { query: "%", limit: 5 }))).toEqual([]);
  });
});
