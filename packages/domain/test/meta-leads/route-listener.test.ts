// The Page route (M4, spec 5): a running, paused or needs-reconnect Page has a route; a draft or a disconnected one has
// none; run twice it is the same; a Page another agency holds is let go; the dispatcher's claim takes the most overdue
// first, skips what is claimed, and holds what it takes.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  claimDueCatchups,
  finishCatchup,
  makeCatchupDue,
  routeCount,
  routeListener,
  routeOfMetaPage,
  routeRowOf,
  routesOfMetaUser,
  upsertRoute,
} from "../../src/meta-leads/index.js";
import { aMetaPageId, aPage, anAgency, auditOf, createTestMeta, memberOf, runListener } from "./support/meta.js";

const test = createTestMeta();
afterAll(() => test.close());

const listener = routeListener({ db: test.db, logger: test.logger });
const changed = (agency: string, pageId: string) =>
  runListener(test, listener, agency, { type: "meta.page-changed", payload: { pageId } });

async function pageIn(status: string, metaUserId = "meta-user-1") {
  const agency = await anAgency(test);
  const member = memberOf(agency);
  const page = await test.db.forOrg(agency, (tx) =>
    aPage(test, tx, agency, { connectedBy: member.userId, status, metaUserId }),
  );
  return { agency, page };
}

describe("the route listener", () => {
  it("writes a route for running, paused and needs_reconnect, and none for connecting and disconnected", async () => {
    const wanted: Record<string, boolean> = {
      connecting: false,
      running: true,
      paused: true,
      needs_reconnect: true,
      disconnected: false,
    };
    for (const [status, routed] of Object.entries(wanted)) {
      const { agency, page } = await pageIn(status);
      await changed(agency, page.id);
      const row = await routeRowOf(test.db, page.metaPageId);
      expect(row !== null, status).toBe(routed);
      if (row !== null)
        expect(row).toMatchObject({ organizationId: agency, metaUserId: "meta-user-1", claimedUntil: null });
    }
  });

  it("gives the same row when run twice, and removes it when the Page is disconnected", async () => {
    const { agency, page } = await pageIn("running");
    await changed(agency, page.id);
    const first = await routeRowOf(test.db, page.metaPageId);
    await changed(agency, page.id);
    expect(await routeRowOf(test.db, page.metaPageId)).toEqual(first);
    await test.db.forOrg(agency, (tx) =>
      tx.metaPage.update({ where: { id: page.id }, data: { status: "disconnected" } }),
    );
    await changed(agency, page.id);
    expect(await routeRowOf(test.db, page.metaPageId)).toBeNull();
    await changed(agency, page.id);
  });

  it("lets go of a Page another agency holds, deleting its token and saying so in the audit log", async () => {
    const first = await pageIn("running");
    await changed(first.agency, first.page.id);
    const other = await anAgency(test);
    const member = memberOf(other);
    const second = await test.db.forOrg(other, (tx) =>
      aPage(test, tx, other, { connectedBy: member.userId, metaPageId: first.page.metaPageId }),
    );
    await changed(other, second.id);
    expect((await routeOfMetaPage(test.db, first.page.metaPageId))?.organizationId).toBe(first.agency);
    const row = await test.db.forOrg(other, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: second.id } }));
    expect(row).toMatchObject({ status: "disconnected", tokenCiphertext: null });
    expect((await auditOf(test, other, second.id)).map((entry) => entry.action)).toEqual(["meta.page-disconnected"]);
  });

  it("does nothing for a Page that is gone", async () => {
    const agency = await anAgency(test);
    await expect(changed(agency, randomUUID())).resolves.toBeUndefined();
  });
});

describe("the routes", () => {
  it("find the Pages of a Meta user across agencies, for the deletion callback", async () => {
    const user = `user-${randomUUID()}`;
    const a = await pageIn("running", user);
    const b = await pageIn("paused", user);
    await changed(a.agency, a.page.id);
    await changed(b.agency, b.page.id);
    const found = await routesOfMetaUser(test.db, user);
    expect(found.map((route) => route.organizationId).sort()).toEqual([a.agency, b.agency].sort());
  });

  it("claim the most overdue due Pages first, skip a claimed one, and hold what they take", async () => {
    const agency = await anAgency(test);
    const now = new Date("2026-10-23T10:00:00Z");
    const pages = [aMetaPageId(), aMetaPageId(), aMetaPageId()];
    const dues = [new Date("2026-10-23T09:50:00Z"), new Date("2026-10-23T09:30:00Z"), new Date("2026-10-23T10:30:00Z")];
    for (const [index, metaPageId] of pages.entries()) {
      await upsertRoute(test.db, {
        metaPageId,
        organizationId: agency,
        metaUserId: "u",
        nextCatchupAt: dues[index] ?? now,
      });
    }
    const first = await claimDueCatchups(test.db, { now, limit: 10, claimSeconds: 300 });
    const mine = first.filter((due) => pages.includes(due.metaPageId));
    expect(mine.map((due) => due.metaPageId)).toEqual([pages[1], pages[0]]);
    const second = await claimDueCatchups(test.db, { now, limit: 10, claimSeconds: 300 });
    expect(second.filter((due) => pages.includes(due.metaPageId))).toEqual([]);
    // A claim lapses after its seconds.
    const later = new Date(now.getTime() + 301_000);
    const third = await claimDueCatchups(test.db, { now: later, limit: 10, claimSeconds: 300 });
    expect(
      third
        .filter((due) => pages.includes(due.metaPageId))
        .map((due) => due.metaPageId)
        .sort(),
    ).toEqual([pages[0], pages[1]].sort());
  });

  it("finish a catch-up with its next time and release, or remove the route; and Check now makes one due", async () => {
    const agency = await anAgency(test);
    const metaPageId = aMetaPageId();
    const now = new Date("2026-10-23T10:00:00Z");
    await upsertRoute(test.db, { metaPageId, organizationId: agency, metaUserId: "u", nextCatchupAt: now });
    await claimDueCatchups(test.db, { now, limit: 100, claimSeconds: 300 });
    const next = new Date("2026-10-23T10:30:00Z");
    await finishCatchup(test.db, { metaPageId, organizationId: agency, nextCatchupAt: next });
    expect(await routeRowOf(test.db, metaPageId)).toMatchObject({ nextCatchupAt: next, claimedUntil: null });
    await makeCatchupDue(test.db, { metaPageId, organizationId: agency, now });
    expect((await routeRowOf(test.db, metaPageId))?.nextCatchupAt).toEqual(now);
    // Another agency's finish touches nothing.
    await finishCatchup(test.db, { metaPageId, organizationId: await anAgency(test), nextCatchupAt: null });
    expect(await routeRowOf(test.db, metaPageId)).not.toBeNull();
    await finishCatchup(test.db, { metaPageId, organizationId: agency, nextCatchupAt: null });
    expect(await routeRowOf(test.db, metaPageId)).toBeNull();
    expect(await routeCount(test.db)).toBeGreaterThanOrEqual(0);
  });
});
