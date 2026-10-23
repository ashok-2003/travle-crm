// A lead from Facebook, end to end through the api and the worker's pieces, with the fake Graph: connect a Page, bring a
// form in, a signed delivery, the stored event processed, the lead made with its source and owner, the same delivery
// again making nothing, the catch-up making up for a delivery that never came, a token that fails, and the deletion
// callback that removes the connection and keeps the leads. No token is in the log at any step.
import { randomUUID } from "node:crypto";
import type {
  MetaConnectedPages,
  MetaConnectFinished,
  MetaConnectStarted,
  MetaFormList,
  MetaPageDetail,
} from "@travel-crm/contracts/meta-leads";
import { catchUpPage } from "@travel-crm/domain/crm";
import { systemActor, newUuidV7 } from "@travel-crm/domain/kernel";
import { routeListener, routeRowOf } from "@travel-crm/domain/meta-leads";
import { processWebhookEvent } from "@travel-crm/domain/webhooks";
import { makeSignedRequest } from "@travel-crm/integrations/meta-graph";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { aMeta, deliveryOf, META_APP_SECRET, signed } from "./support/meta.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query } from "./support/trpc.js";
import { metaProcessDependencies } from "../src/meta-services.js";

const questions = [
  { key: "full_name", type: "full_name", label: "Full name" },
  { key: "phone_number", type: "phone", label: "Phone number" },
  { key: "email", type: "email", label: "Email" },
  { key: "where_to", type: "custom", label: "Where do you want to go?" },
] as const;

describe("a lead from Facebook, end to end", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let pageId = "";
  let formRowId = "";
  const metaPageId = `${String(Date.now())}1`;
  const formId = `F${String(Date.now())}`;
  const pageToken = `page-token-${randomUUID()}`;
  const metaUserId = `meta-user-${randomUUID()}`;
  let phoneNumber = 0;
  const phone = () => `+9198${String(70_000_000 + (phoneNumber += 1)).padStart(8, "0")}`;

  const graph = () => {
    if (server.meta === null) throw new Error("no meta");
    return server.meta.graph;
  };
  const process = async (leadgenId: string) => {
    const body = deliveryOf({ leadgenId, pageId: metaPageId, formId });
    const response = await server.app.request("/webhooks/meta-leads", { method: "POST", headers: signed(body), body });
    expect(response.status).toBe(200);
    const event = await server.platform.webhookEvent.findFirstOrThrow({
      where: { provider: "meta-leads", providerEventId: leadgenId },
    });
    return processWebhookEvent({ db: server.db, providers: server.meta ? [server.meta.provider] : [] }, event.id);
  };
  const leads = () => server.db.forOrg(agency.organizationId, (tx) => tx.lead.findMany({ orderBy: { id: "asc" } }));
  const logged = () => JSON.stringify(server.logger.entries);
  /** The worker's listener of meta.page-changed, run by hand. */
  const changed = () =>
    routeListener({ db: server.db, logger: server.logger }).handle(
      {
        id: newUuidV7(),
        organizationId: agency.organizationId,
        type: "meta.page-changed",
        payload: { pageId },
        occurredAt: new Date(),
      },
      { actor: systemActor(agency.organizationId), forOrg: (fn) => server.db.forOrg(agency.organizationId, fn) },
    );

  beforeAll(async () => {
    server = createTestServer({}, { metaFor: aMeta });
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    graph().addForm(metaPageId, { id: formId, name: "Rajasthan winter ad", questions: [...questions] });
    graph().addLogin("flow-code", {
      userId: metaUserId,
      pages: [{ id: metaPageId, name: "Yatra Hikes", token: pageToken, canAdvertise: true }],
    });
  });
  afterAll(async () => {
    await server.close();
  });

  it("connects the Page and brings the form in, with its route made by the listener", async () => {
    const started = await dataOf<MetaConnectStarted>(await mutate(server, "metaLeads.connectStart", {}, owner));
    const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";
    const finished = await dataOf<MetaConnectFinished>(
      await mutate(server, "metaLeads.connectFinish", { code: "flow-code", state }, owner),
    );
    expect(finished.pages[0]?.availability).toBe("available");
    const connected = await dataOf<MetaConnectedPages>(
      await mutate(server, "metaLeads.connectPages", { pageIds: [metaPageId] }, owner),
    );
    pageId = connected.connected[0]?.id ?? "";
    // The worker's listener of meta.page-changed writes the route.
    await routeListener({ db: server.db, logger: server.logger }).handle(
      {
        id: newUuidV7(),
        organizationId: agency.organizationId,
        type: "meta.page-changed",
        payload: { pageId },
        occurredAt: new Date(),
      },
      { actor: systemActor(agency.organizationId), forOrg: (fn) => server.db.forOrg(agency.organizationId, fn) },
    );
    expect(await routeRowOf(server.db, metaPageId)).toMatchObject({
      organizationId: agency.organizationId,
      metaUserId,
    });
    const forms = await dataOf<MetaFormList>(await query(server, "metaLeads.forms", owner, { pageId }));
    expect(forms.items).toMatchObject([{ formId, name: "Rajasthan winter ad", state: "not_brought_in" }]);
    formRowId = forms.items[0]?.id ?? "";
    await dataOf(
      await mutate(
        server,
        "metaLeads.bringIn",
        { pageId, formId: formRowId, questions: [], earlierLeads: "only_new" },
        owner,
      ),
    );
    const page = await dataOf<MetaPageDetail>(await query(server, "metaLeads.get", owner, { pageId }));
    expect(page.badge).toBe("running");
  });

  it("makes a lead of a signed delivery, and none of the same delivery again", async () => {
    graph().addLead({
      id: "FB-1",
      formId,
      answers: {
        full_name: ["Asha Rao"],
        phone_number: [`p:${phone()}`],
        email: ["asha@example.test"],
        where_to: ["Jaisalmer"],
      },
      platform: "instagram",
    });
    expect(await process("FB-1")).toBe("processed");
    const [lead] = await leads();
    expect(lead).toMatchObject({
      source: "meta_lead_ad",
      sourceDetail: "Rajasthan winter ad · Instagram",
      ownerUserId: agency.owner.userId,
      stage: "new",
    });
    const events = await server.platform.webhookEvent.count({ where: { providerEventId: "FB-1" } });
    expect(events).toBe(1);
    expect(await process("FB-1")).toBe("already-processed");
    expect(await leads()).toHaveLength(1);
    const page = await dataOf<MetaPageDetail>(await query(server, "metaLeads.get", owner, { pageId }));
    expect(page.counts.added).toBe(1);
  });

  it("makes up for a delivery that never came, on the next catch-up", async () => {
    graph().addLead({
      id: "FB-MISSED",
      formId,
      answers: { full_name: ["Ravi Kumar"], phone_number: [phone()] },
      createdAt: new Date(Date.now() - 120_000),
    });
    const dependencies = metaProcessDependencies(
      server.meta?.services.dependencies ??
        (() => {
          throw new Error("no meta");
        })(),
      {
        identity: server.identity,
        subscriptions: server.subscriptions,
      },
    );
    const result = await catchUpPage(dependencies, agency.organizationId, metaPageId, new Date());
    expect(result.added).toBe(1);
    expect(await leads()).toHaveLength(2);
  });

  it("moves the Page to needs_reconnect when its token fails, and shows it on the page", async () => {
    graph().expireToken(pageToken);
    graph().addLead({ id: "FB-2", formId, answers: { full_name: ["Neha Joshi"], phone_number: [phone()] } });
    await process("FB-2");
    const page = await dataOf<MetaPageDetail>(await query(server, "metaLeads.get", owner, { pageId }));
    expect(page).toMatchObject({ status: "needs_reconnect", badge: "needs_reconnect" });
    expect(await leads()).toHaveLength(2);
  });

  it("keeps no token in the log, and removes the connection but not the leads when Meta asks for the user's data to go", async () => {
    expect(logged()).not.toContain(pageToken);
    const response = await server.app.request("/api/meta/data-deletion", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        signed_request: makeSignedRequest(
          { algorithm: "HMAC-SHA256", user_id: metaUserId, expires: Math.floor(Date.now() / 1000) + 600 },
          META_APP_SECRET,
        ),
      }).toString(),
    });
    expect(response.status).toBe(200);
    const row = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.metaPage.findUniqueOrThrow({ where: { id: pageId } }),
    );
    expect(row).toMatchObject({ status: "disconnected", tokenCiphertext: null });
    // The worker's listener of the disconnection's event drops the route; until then a delivery finds no live Page.
    await changed();
    expect(await routeRowOf(server.db, metaPageId)).toBeNull();
    expect(await leads()).toHaveLength(2);
    expect(logged()).not.toContain(metaUserId);
    // A delivery for the disconnected Page is a quiet success: nothing is made.
    graph().addLead({ id: "FB-3", formId, answers: { full_name: ["Late Person"], phone_number: [phone()] } });
    expect(await process("FB-3")).toBe("processed");
    expect(await leads()).toHaveLength(2);
  });
});
