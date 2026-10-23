// The Meta lead ads over HTTP (spec 6.3, M5, M6, section 10): the webhook's verification and signature, the deletion
// callback, who may use a procedure, the steps of connecting in their order, and that no token is ever in an answer. The
// worker's work is run by hand in meta-leads-flow.test.ts.
import { randomUUID } from "node:crypto";
import type {
  MetaConnectedPages,
  MetaConnectFinished,
  MetaConnectStarted,
  MetaPageDetail,
  MetaPageList,
} from "@travel-crm/contracts/meta-leads";
import { makeSignedRequest } from "@travel-crm/integrations/meta-graph";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { aMeta, deliveryOf, META_APP_SECRET, META_VERIFY_TOKEN, signed } from "./support/meta.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("the Meta lead ads over HTTP", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let salesperson: CookieJar;
  let admin: CookieJar;
  const graph = () => {
    if (server.meta === null) throw new Error("no meta");
    return server.meta.graph;
  };

  beforeAll(async () => {
    server = createTestServer({}, { metaFor: aMeta });
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    admin = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "priya", roleKey: "org-admin" }),
    );
    salesperson = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "zara", roleKey: "sales" }),
    );
  });
  afterAll(async () => {
    await server.close();
  });

  describe("the webhook's verification (M6)", () => {
    const verify = (query: Record<string, string>) =>
      server.app.request(`/webhooks/meta-leads?${new URLSearchParams(query).toString()}`);

    it("answers the challenge as plain text when the token matches", async () => {
      const response = await verify({
        "hub.mode": "subscribe",
        "hub.verify_token": META_VERIFY_TOKEN,
        "hub.challenge": "1158201444",
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("1158201444");
      expect(response.headers.get("content-type")).toContain("text/plain");
    });

    it("answers a bare 403 for a wrong token, a wrong mode, and a missing challenge", async () => {
      for (const attempt of [
        { "hub.mode": "subscribe", "hub.verify_token": "wrong-token", "hub.challenge": "1" },
        { "hub.mode": "subscribe", "hub.verify_token": META_VERIFY_TOKEN.slice(1), "hub.challenge": "1" },
        { "hub.mode": "unsubscribe", "hub.verify_token": META_VERIFY_TOKEN, "hub.challenge": "1" },
        { "hub.mode": "subscribe", "hub.verify_token": META_VERIFY_TOKEN },
        {},
      ]) {
        const response = await verify(attempt);
        expect(response.status, JSON.stringify(attempt)).toBe(403);
        expect(await response.text()).toBe("");
      }
    });

    it("is not there at all when Meta is off", async () => {
      const bare = createTestServer({}, {});
      try {
        const response = await bare.app.request(
          `/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`,
        );
        expect(response.status).toBe(404);
      } finally {
        await bare.close();
      }
    });
  });

  describe("the webhook's signature (M5)", () => {
    const post = (body: string, headers: Record<string, string>) =>
      server.app.request("/webhooks/meta-leads", { method: "POST", headers, body });
    const stored = (leadgenId: string) =>
      server.platform.webhookEvent.count({ where: { provider: "meta-leads", providerEventId: leadgenId } });

    it("takes a delivery signed with the app secret, stores its ids only, and a replay is stored once", async () => {
      const id = `L-${randomUUID()}`;
      const body = deliveryOf({ leadgenId: id, pageId: "1122", formId: "7001" });
      expect((await post(body, signed(body))).status).toBe(200);
      expect((await post(body, signed(body))).status).toBe(200);
      expect(await stored(id)).toBe(1);
      const event = await server.platform.webhookEvent.findFirstOrThrow({
        where: { provider: "meta-leads", providerEventId: id },
      });
      expect(event.eventType).toBe("leadgen");
      expect(Object.keys(event.headers as object)).toEqual(["x-hub-signature-256"]);
      // The stored body holds ids and no answer.
      expect(event.payload).not.toMatch(/phone|email|name/i);
    });

    it("refuses a wrong secret, a missing or malformed signature, a wrong prefix and an altered body, storing nothing", async () => {
      const id = `L-${randomUUID()}`;
      const body = deliveryOf({ leadgenId: id, pageId: "1122", formId: "7001" });
      const good = signed(body);
      const attempts: [string, string, Record<string, string>][] = [
        ["another secret", body, signed(body, "another-secret")],
        ["no signature", body, { "content-type": "application/json" }],
        ["no prefix", body, { ...good, "x-hub-signature-256": good["x-hub-signature-256"].slice(7) }],
        [
          "sha1 prefix",
          body,
          { ...good, "x-hub-signature-256": good["x-hub-signature-256"].replace("sha256=", "sha1=") },
        ],
        ["not hex", body, { ...good, "x-hub-signature-256": "sha256=zzzz" }],
        ["altered body", body.replace("7001", "7002"), good],
      ];
      for (const [name, sent, headers] of attempts) expect((await post(sent, headers)).status, name).toBe(401);
      expect(await stored(id)).toBe(0);
    });

    it("answers a signed body it cannot read with 400, and a signed delivery of nothing for us with 200", async () => {
      const garbage = "not json";
      expect((await post(garbage, signed(garbage))).status).toBe(400);
      const nothing = JSON.stringify({ object: "page", entry: [{ id: "1", changes: [{ field: "feed", value: {} }] }] });
      expect((await post(nothing, signed(nothing))).status).toBe(200);
      const otherObject = JSON.stringify({ object: "user", entry: [] });
      expect((await post(otherObject, signed(otherObject))).status).toBe(400);
    });

    it("identifies a batch by all its leads, so a different batch is stored, and the same one again is not", async () => {
      const a = `A-${randomUUID()}`;
      const b = `B-${randomUUID()}`;
      const batch = deliveryOf({ leadgenId: a, pageId: "1", formId: "9" }, { leadgenId: b, pageId: "1", formId: "9" });
      const reordered = deliveryOf(
        { leadgenId: b, pageId: "1", formId: "9" },
        { leadgenId: a, pageId: "1", formId: "9" },
      );
      const other = deliveryOf(
        { leadgenId: a, pageId: "1", formId: "9" },
        { leadgenId: `C-${randomUUID()}`, pageId: "1", formId: "9" },
      );
      const count = () =>
        server.platform.webhookEvent.count({
          where: { provider: "meta-leads", providerEventId: { startsWith: "batch:" } },
        });
      const before = await count();
      for (const body of [batch, reordered, other]) await post(body, signed(body));
      expect((await count()) - before).toBe(2);
    });
  });

  describe("the data deletion callback (section 10)", () => {
    const callback = (signedRequest: string | null) =>
      server.app.request("/api/meta/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: signedRequest === null ? "" : new URLSearchParams({ signed_request: signedRequest }).toString(),
      });
    const now = Math.floor(Date.now() / 1000);

    it("refuses what is not Meta's with 400: no body, another secret, expired, malformed", async () => {
      expect((await callback(null)).status).toBe(400);
      expect(
        (
          await callback(
            makeSignedRequest({ algorithm: "HMAC-SHA256", user_id: "u", expires: now + 600 }, "another-secret"),
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await callback(
            makeSignedRequest({ algorithm: "HMAC-SHA256", user_id: "u", expires: now - 600 }, META_APP_SECRET),
          )
        ).status,
      ).toBe(400);
      expect((await callback("garbage")).status).toBe(400);
    });

    it("answers a valid request with a status address and a code, also for a user with no Page", async () => {
      const response = await callback(
        makeSignedRequest(
          { algorithm: "HMAC-SHA256", user_id: `nobody-${randomUUID()}`, expires: now + 600 },
          META_APP_SECRET,
        ),
      );
      expect(response.status).toBe(200);
      const answer = (await response.json()) as { url: string; confirmation_code: string };
      expect(answer.url).toBe(`http://localhost:3000/meta/deletion?code=${answer.confirmation_code}`);
      expect(answer.confirmation_code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    });

    it("is not under the trusted-origin rule and is capped at 4 KB", async () => {
      const big = await server.app.request("/api/meta/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `signed_request=${"a".repeat(5000)}`,
      });
      expect(big.status).toBe(413);
    });
  });

  describe("the procedures", () => {
    const list = (jar = owner) => query(server, "metaLeads.list", jar).then((r) => dataOf<MetaPageList>(r));

    it("lets only holders of both leads:create and leads:assign in, on the crm plan module", async () => {
      expect(await refusalOf(await query(server, "metaLeads.list", salesperson))).toEqual({
        status: 403,
        reason: "MISSING_PERMISSION",
      });
      expect(await refusalOf(await query(server, "metaLeads.list"))).toMatchObject({ status: 401 });
      expect(await refusalOf(await mutate(server, "metaLeads.connectStart", {}, salesperson))).toEqual({
        status: 403,
        reason: "MISSING_PERMISSION",
      });
      await expect(list(admin)).resolves.toBeDefined();
    });

    it("lists no Pages at first, with the limit, saying Meta is set up and this is no demo", async () => {
      expect(await list()).toEqual({ items: [], limit: 5, configured: true, demo: false });
    });

    it("says Meta is not set up when it is not, and refuses the steps with their sentence's reason", async () => {
      const bare = createTestServer({}, {});
      try {
        const other = await createTestAgency(bare);
        const jar = await signedInOwner(bare, other);
        expect(await dataOf<MetaPageList>(await query(bare, "metaLeads.list", jar))).toMatchObject({
          configured: false,
        });
        expect(await refusalOf(await mutate(bare, "metaLeads.connectStart", {}, jar))).toMatchObject({
          reason: "META_NOT_CONFIGURED",
        });
      } finally {
        await bare.close();
      }
    });

    it("walks the connect steps: the address, the Pages shared, the ones ticked, and the Page's own page", async () => {
      const started = await dataOf<MetaConnectStarted>(await mutate(server, "metaLeads.connectStart", {}, owner));
      const url = new URL(started.authorizeUrl);
      expect(url.searchParams.get("client_id")).toBe("1234567890");
      const state = url.searchParams.get("state") ?? "";
      graph().addLogin("code-http", {
        userId: "meta-user-http",
        pages: [{ id: "55001", name: "Yatra Hikes", token: "page-token-http-secret", canAdvertise: true }],
      });
      const finished = await dataOf<MetaConnectFinished>(
        await mutate(server, "metaLeads.connectFinish", { code: "code-http", state }, owner),
      );
      expect(finished.pages).toEqual([{ pageId: "55001", name: "Yatra Hikes", availability: "available" }]);
      // The same code and state again are refused: the state is single-use.
      expect(
        await refusalOf(await mutate(server, "metaLeads.connectFinish", { code: "code-http", state }, owner)),
      ).toMatchObject({ reason: "META_LOGIN_FAILED" });
      const connected = await dataOf<MetaConnectedPages>(
        await mutate(server, "metaLeads.connectPages", { pageIds: ["55001"] }, owner),
      );
      expect(connected.connected).toHaveLength(1);
      const pageId = connected.connected[0]?.id ?? "";
      const page = await dataOf<MetaPageDetail>(await query(server, "metaLeads.get", owner, { pageId }));
      expect(page).toMatchObject({ pageName: "Yatra Hikes", status: "running", badge: "running", readOnly: false });
      expect(page.connectedBy?.userId).toBe(agency.owner.userId);
      expect(await list()).toMatchObject({
        items: [{ id: pageId, pageName: "Yatra Hikes", badge: "running", formsBroughtIn: 0 }],
      });
    });

    it("never puts a token or a ciphertext in any answer, nor the app secret", async () => {
      const answers = [
        await (await query(server, "metaLeads.list", owner)).text(),
        await (await mutate(server, "metaLeads.connectStart", {}, owner)).text(),
      ];
      const pageId = (await list()).items[0]?.id ?? "";
      answers.push(await (await query(server, "metaLeads.get", owner, { pageId })).text());
      for (const answer of answers)
        expect(answer).not.toMatch(/page-token-http-secret|ciphertext|nonce|tokenKey|0123456789abcdef0123456789abcdef/);
    });

    it("does not find another agency's Page", async () => {
      const pageId = (await list()).items[0]?.id ?? "";
      const other = await createTestAgency(server);
      const jar = await signedInOwner(server, other);
      expect(await refusalOf(await query(server, "metaLeads.get", jar, { pageId }))).toMatchObject({ status: 404 });
      expect(await refusalOf(await mutate(server, "metaLeads.pause", { pageId }, jar))).toMatchObject({ status: 404 });
    });

    it("pauses, resumes and disconnects, and a read-only agency may still pause and disconnect but not resume", async () => {
      const pageId = (await list()).items[0]?.id ?? "";
      await dataOf(await mutate(server, "metaLeads.pause", { pageId }, owner));
      expect((await list()).items[0]?.badge).toBe("paused");
      await server.platform.subscription.update({
        where: { organizationId: agency.organizationId },
        data: { status: "read_only" },
      });
      try {
        expect(await refusalOf(await mutate(server, "metaLeads.resume", { pageId }, owner))).toMatchObject({
          reason: "ORGANIZATION_READ_ONLY",
        });
        await dataOf(await mutate(server, "metaLeads.pause", { pageId }, owner));
      } finally {
        await server.platform.subscription.update({
          where: { organizationId: agency.organizationId },
          data: { status: "active" },
        });
      }
      await dataOf(await mutate(server, "metaLeads.resume", { pageId }, owner));
      await dataOf(await mutate(server, "metaLeads.disconnect", { pageId }, owner));
      expect((await list()).items).toEqual([]);
      expect(await refusalOf(await query(server, "metaLeads.get", owner, { pageId }))).toMatchObject({ status: 404 });
    });
  });
});
