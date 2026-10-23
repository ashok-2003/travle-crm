// Connecting Pages (spec 3.2, 4.1, M1, M4): the login's address and state, the Pages the person shared with what can be
// done with each, the token sealed and never returned, the limit of five, a Page held by another agency refused, and a
// reconnect on the same row.
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import {
  callGraph,
  connectPages,
  finishConnect,
  openPageToken,
  removeRoute,
  routeRowOf,
  startConnect,
  upsertRoute,
} from "../../src/meta-leads/index.js";
import { MetaGraphError } from "@travel-crm/integrations/meta-graph";
import { makeConnectState } from "../../src/meta-leads/connect-state.js";
import {
  anAgency,
  appSecret,
  aMetaPageId,
  aPage,
  auditOf,
  createTestMeta,
  eventsOf,
  memberOf,
  shareWithGraph,
} from "./support/meta.js";

const test = createTestMeta();
afterAll(() => test.close());
const now = new Date("2026-10-23T10:00:00Z");

const reasonOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).reason;
};

/** Runs the login of `code` for the member: the address, then Facebook's answer with the state taken from it. */
async function login(agency: string, member: ReturnType<typeof memberOf>, code: string, reconnectPageId?: string) {
  const started = await startConnect(test.dependencies, member, { reconnectPageId }, now);
  const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";
  return finishConnect(test.dependencies, member, { code, state }, now);
}

describe("startConnect", () => {
  it("builds Facebook's dialog for our configuration, with a signed state", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const started = await startConnect(test.dependencies, member, {}, now);
    const url = new URL(started.authorizeUrl);
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.pathname).toBe("/v25.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("1234567890");
    expect(url.searchParams.get("config_id")).toBe("9876543210");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.in/settings/lead-sources/meta/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")?.length).toBeGreaterThan(20);
    // The app secret is no part of the address.
    expect(started.authorizeUrl).not.toContain(appSecret);
    expect(new Date(started.expiresAt).getTime()).toBeGreaterThan(now.getTime());
  });

  it("is refused when Meta is not set up", async () => {
    const agency = await anAgency(test);
    const off = { ...test.dependencies, graph: null, login: null };
    expect(await reasonOf(startConnect(off, memberOf(agency), {}, now))).toBe("META_NOT_CONFIGURED");
  });
});

describe("finishConnect", () => {
  it("lists the Pages shared, keeps the available ones as drafts with a sealed token, and returns no token", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const mine = aMetaPageId();
    const notMine = aMetaPageId();
    shareWithGraph(test, {
      code: "c1",
      userId: "u-100",
      pages: [
        { id: mine, name: "Yatra Hikes", token: "page-token-secret-1" },
        { id: notMine, name: "Not allowed", token: "page-token-secret-2", canAdvertise: false },
      ],
    });
    const finished = await login(agency, member, "c1");
    expect(finished.pages).toEqual([
      { pageId: mine, name: "Yatra Hikes", availability: "available" },
      { pageId: notMine, name: "Not allowed", availability: "not_allowed" },
    ]);
    expect(JSON.stringify(finished)).not.toContain("secret");
    const rows = await test.db.forOrg(agency, (tx) => tx.metaPage.findMany());
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({ pageId: mine, status: "connecting", metaUserId: "u-100", connectedBy: member.userId });
    expect(Buffer.from(row?.tokenCiphertext ?? []).includes(Buffer.from("page-token-secret-1"))).toBe(false);
    const stored = await test.db.forOrg(agency, (tx) => tx.metaPage.findFirstOrThrow());
    expect(
      openPageToken(test.secretBox, {
        organizationId: agency,
        id: stored.id,
        tokenCiphertext: stored.tokenCiphertext,
        tokenNonce: stored.tokenNonce,
        tokenKeyVersion: stored.tokenKeyVersion,
      }),
    ).toBe("page-token-secret-1");
  });

  it("refuses a state signed with another secret, for another member or agency, expired, or used twice", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    shareWithGraph(test, { code: "c2", pages: [{ id: aMetaPageId(), token: "t" }] });
    const good = (await startConnect(test.dependencies, member, {}, now)).authorizeUrl;
    const state = new URL(good).searchParams.get("state") ?? "";
    const finish = (value: string, who = member, at = now) =>
      finishConnect(test.dependencies, who, { code: "c2", state: value }, at);
    expect(await reasonOf(finish("nonsense"))).toBe("META_LOGIN_FAILED");
    const forged = makeConnectState("another-secret", {
      organizationId: agency,
      userId: member.userId,
      reconnectPageRowId: null,
      expiresAt: new Date(now.getTime() + 60_000),
    });
    expect(await reasonOf(finish(forged))).toBe("META_LOGIN_FAILED");
    expect(await reasonOf(finish(state, memberOf(agency)))).toBe("META_LOGIN_FAILED");
    expect(await reasonOf(finish(state, member, new Date(now.getTime() + 3600_000)))).toBe("META_LOGIN_FAILED");
    await expect(finish(state)).resolves.toBeDefined();
    expect(await reasonOf(finish(state))).toBe("META_LOGIN_FAILED");
  });

  it("refuses an unknown code, and a login that shared no Page", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    expect(await reasonOf(login(agency, member, "never-issued"))).toBe("META_LOGIN_FAILED");
    shareWithGraph(test, { code: "empty", pages: [] });
    expect(await reasonOf(login(agency, member, "empty"))).toBe("META_PERMISSION_MISSING");
  });

  it("marks a Page another agency holds as connected elsewhere, and one already connected here", async () => {
    const first = await anAgency(test);
    const second = await anAgency(test);
    const memberA = memberOf(first);
    const memberB = memberOf(second);
    const page = aMetaPageId();
    const taken = await test.db.forOrg(first, (tx) =>
      aPage(test, tx, first, { connectedBy: memberA.userId, metaPageId: page }),
    );
    await upsertRoute(test.dependencies.db, {
      metaPageId: page,
      organizationId: first,
      metaUserId: "meta-user-1",
      nextCatchupAt: now,
    });
    shareWithGraph(test, { code: "c3", pages: [{ id: page, token: taken.token }] });
    expect((await login(second, memberB, "c3")).pages[0]?.availability).toBe("connected_elsewhere");
    shareWithGraph(test, { code: "c4", pages: [{ id: page, token: taken.token }] });
    expect((await login(first, memberA, "c4")).pages[0]?.availability).toBe("connected_here");
    expect(await test.db.forOrg(second, (tx) => tx.metaPage.count())).toBe(0);
  });
});

describe("connectPages", () => {
  it("subscribes the ticked Pages, runs them, audits it, and tells the route to be made", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const ticked = aMetaPageId();
    const left = aMetaPageId();
    shareWithGraph(test, {
      code: "c5",
      pages: [
        { id: ticked, token: "token-ticked" },
        { id: left, token: "token-left" },
      ],
    });
    await login(agency, member, "c5");
    const result = await connectPages(test.dependencies, member, [ticked], now);
    expect(result.connected.map((page) => page.pageId)).toEqual([ticked]);
    expect(result.refused).toEqual([]);
    expect(test.graph.subscribedPages.has(ticked)).toBe(true);
    expect(test.graph.subscribedPages.has(left)).toBe(false);
    const rows = await test.db.forOrg(agency, (tx) => tx.metaPage.findMany({ orderBy: { pageId: "asc" } }));
    expect(Object.fromEntries(rows.map((row) => [row.pageId, row.status]))).toEqual({
      [ticked]: "running",
      [left]: "disconnected",
    });
    // The unticked Page's token is gone.
    expect(rows.find((row) => row.pageId === left)?.tokenCiphertext).toBeNull();
    const connected = result.connected[0];
    expect((await eventsOf(test, agency, ["meta.page-changed"])).map(([, payload]) => payload)).toEqual([
      { pageId: connected?.id },
    ]);
    expect((await auditOf(test, agency, connected?.id ?? "")).map((entry) => entry.action)).toEqual([
      "meta.page-connected",
    ]);
  });

  it("refuses the sixth Page", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    await test.db.forOrg(agency, async (tx) => {
      for (let n = 0; n < 5; n += 1) await aPage(test, tx, agency, { connectedBy: member.userId });
    });
    const sixth = aMetaPageId();
    shareWithGraph(test, { code: "c6", pages: [{ id: sixth, token: "t6" }] });
    await login(agency, member, "c6");
    const result = await connectPages(test.dependencies, member, [sixth], now);
    expect(result).toEqual({ connected: [], refused: [{ pageId: sixth, reason: "META_PAGE_LIMIT" }] });
    expect(test.graph.subscribedPages.has(sixth)).toBe(false);
  });

  it("refuses a Page another agency took meanwhile, and one Meta will not subscribe", async () => {
    const agency = await anAgency(test);
    const other = await anAgency(test);
    const member = memberOf(agency);
    const taken = aMetaPageId();
    const refused = aMetaPageId();
    shareWithGraph(test, {
      code: "c7",
      pages: [
        { id: taken, token: "tt" },
        { id: refused, token: "tr" },
      ],
    });
    await login(agency, member, "c7");
    // Another agency took the Page after this draft was made (its draft route lapsed).
    await removeRoute(test.dependencies.db, agency, taken);
    await upsertRoute(test.dependencies.db, {
      metaPageId: taken,
      organizationId: other,
      metaUserId: "x",
      nextCatchupAt: now,
    });
    test.graph.failNext("permission", { pageId: refused });
    const result = await connectPages(test.dependencies, member, [taken, refused], now);
    expect(result.connected).toEqual([]);
    expect(Object.fromEntries(result.refused.map((entry) => [entry.pageId, entry.reason]))).toEqual({
      [taken]: "META_PAGE_TAKEN",
      [refused]: "META_PERMISSION_MISSING",
    });
  });

  it("refuses a Page that was never chosen by this member", async () => {
    const agency = await anAgency(test);
    const result = await connectPages(test.dependencies, memberOf(agency), ["12345"], now);
    expect(result.refused).toEqual([{ pageId: "12345", reason: "META_PAGE_NOT_ALLOWED" }]);
  });

  it("does not use a draft another member made", async () => {
    const agency = await anAgency(test);
    const maker = memberOf(agency);
    const page = aMetaPageId();
    shareWithGraph(test, { code: "c8", pages: [{ id: page, token: "t8" }] });
    await login(agency, maker, "c8");
    const result = await connectPages(test.dependencies, memberOf(agency), [page], now);
    expect(result.connected).toEqual([]);
  });
});

describe("a reconnect", () => {
  it("gives the same Page a new token, runs it again and asks for its check", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const page = await test.db.forOrg(agency, (tx) =>
      aPage(test, tx, agency, { connectedBy: member.userId, status: "needs_reconnect", attentionSince: now }),
    );
    shareWithGraph(test, { code: "c9", pages: [{ id: page.metaPageId, token: "fresh-token" }] });
    const finished = await login(agency, member, "c9", page.id);
    expect(finished.reconnectPageRowId).toBe(page.id);
    const row = await test.db.forOrg(agency, (tx) => tx.metaPage.findUniqueOrThrow({ where: { id: page.id } }));
    expect(row).toMatchObject({ status: "running", attentionSince: null, consecutiveFailures: 0 });
    expect(openPageToken(test.secretBox, row)).toBe("fresh-token");
    expect(test.graph.subscribedPages.has(page.metaPageId)).toBe(true);
    expect((await eventsOf(test, agency, ["meta.check-requested"])).map(([, payload]) => payload)).toEqual([
      { pageId: page.id },
    ]);
    expect((await auditOf(test, agency, page.id)).map((entry) => entry.action)).toEqual(["meta.page-reconnected"]);
  });

  it("is refused when the person cannot advertise on the Page any more", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const page = await test.db.forOrg(agency, (tx) =>
      aPage(test, tx, agency, { connectedBy: member.userId, status: "needs_reconnect" }),
    );
    shareWithGraph(test, { code: "c10", pages: [{ id: page.metaPageId, token: "x", canAdvertise: false }] });
    expect(await reasonOf(login(agency, member, "c10", page.id))).toBe("META_PAGE_NOT_ALLOWED");
  });
});

describe("review fixes", () => {
  it("takes the last place for one of two people connecting at once, not both (the cap race)", async () => {
    const agency = await anAgency(test);
    const first = memberOf(agency);
    const second = memberOf(agency);
    await test.db.forOrg(agency, async (tx) => {
      for (let n = 0; n < 4; n += 1) await aPage(test, tx, agency, { connectedBy: first.userId });
    });
    const pageA = aMetaPageId();
    const pageB = aMetaPageId();
    shareWithGraph(test, { code: "race-a", pages: [{ id: pageA, token: "ta" }] });
    shareWithGraph(test, { code: "race-b", pages: [{ id: pageB, token: "tb" }] });
    await login(agency, first, "race-a");
    await login(agency, second, "race-b");
    const [a, b] = await Promise.all([
      connectPages(test.dependencies, first, [pageA], now),
      connectPages(test.dependencies, second, [pageB], now),
    ]);
    expect(a.connected.length + b.connected.length).toBe(1);
    expect([...a.refused, ...b.refused].map((entry) => entry.reason)).toEqual(["META_PAGE_LIMIT"]);
    const live = await test.db.forOrg(agency, (tx) => tx.metaPage.count({ where: { status: "running" } }));
    expect(live).toBe(5);
  });

  it("gives the place back when Meta will not subscribe the Page", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const page = aMetaPageId();
    shareWithGraph(test, { code: "back", pages: [{ id: page, token: "tb" }] });
    await login(agency, member, "back");
    test.graph.failNext("unavailable", { pageId: page });
    const result = await connectPages(test.dependencies, member, [page], now);
    expect(result.refused).toEqual([{ pageId: page, reason: "META_UNAVAILABLE" }]);
    expect((await test.db.forOrg(agency, (tx) => tx.metaPage.findFirstOrThrow())).status).toBe("connecting");
  });

  it("says the login failed for a code Meta refuses, and that Facebook is not answering only when it is not", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const started = async () =>
      new URL((await startConnect(test.dependencies, member, {}, now)).authorizeUrl).searchParams.get("state") ?? "";
    test.graph.throwNext(new MetaGraphError("token_invalid", { code: 100, subcode: 36009 }));
    expect(await reasonOf(finishConnect(test.dependencies, member, { code: "x", state: await started() }, now))).toBe(
      "META_LOGIN_FAILED",
    );
    test.graph.throwNext(new MetaGraphError("not_found", { code: 100 }));
    expect(await reasonOf(finishConnect(test.dependencies, member, { code: "x", state: await started() }, now))).toBe(
      "META_LOGIN_FAILED",
    );
    test.graph.throwNext(new MetaGraphError("unavailable", { code: 2 }));
    expect(await reasonOf(finishConnect(test.dependencies, member, { code: "x", state: await started() }, now))).toBe(
      "META_UNAVAILABLE",
    );
  });

  it("keeps a draft's route so the deletion callback finds it, and drops it with the draft; and caps drafts at twenty", async () => {
    const agency = await anAgency(test);
    const member = memberOf(agency);
    const ids = Array.from({ length: 22 }, () => aMetaPageId());
    shareWithGraph(test, { code: "many", userId: "u-many", pages: ids.map((id) => ({ id, token: `t-${id}` })) });
    const finished = await login(agency, member, "many");
    expect(finished.pages).toHaveLength(22);
    expect(await test.db.forOrg(agency, (tx) => tx.metaPage.count({ where: { status: "connecting" } }))).toBe(20);
    expect(await routeRowOf(test.db, ids[0] ?? "")).toMatchObject({ organizationId: agency, metaUserId: "u-many" });
    expect(await routeRowOf(test.db, ids[21] ?? "")).toBeNull();
    await connectPages(test.dependencies, member, [ids[0] ?? ""], now);
    expect(await routeRowOf(test.db, ids[1] ?? "")).toBeNull();
    expect(await routeRowOf(test.db, ids[0] ?? "")).not.toBeNull();
  });

  it("caps a person's own Graph calls per organization, apart from the leads' budget", async () => {
    const agency = await anAgency(test);
    const limited = {
      ...test.dependencies,
      graphBudget: { perHour: 1000, catchupPerHour: 1000, interactivePerHour: 2 },
    };
    const call = () => callGraph(limited, agency, "interactive", () => Promise.resolve(1));
    expect((await call()).ok).toBe(true);
    expect((await call()).ok).toBe(true);
    const third = await call();
    expect(third.ok).toBe(false);
    expect(!third.ok && third.failure.reason).toBe("budget");
    // The webhook lane is a budget of its own.
    expect((await callGraph(limited, agency, "webhook", () => Promise.resolve(1))).ok).toBe(true);
    // Another agency is not affected.
    expect((await callGraph(limited, await anAgency(test), "interactive", () => Promise.resolve(1))).ok).toBe(true);
  });
});
