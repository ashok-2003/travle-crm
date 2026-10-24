// A WhatsApp message end to end through the api and the worker's pieces, with the in-memory MSG91: the webhook refuses
// strangers with a bare 401 and stores nothing, answers 200 to anything carrying both secrets (even an unreadable or oversized
// body: a 4xx would pause MSG91's webhook for every agency), the stored event is processed into a lead and a chat, and the
// signed-in Owner reads them through inbox.*. A salesperson sees only the chats of their own leads. No secret is in the log.
import { randomUUID } from "node:crypto";
import type { ChatMessagePage, ConversationHeader, ConversationPage, InboxStatus } from "@travel-crm/contracts/inbox";
import { processWebhookEvent } from "@travel-crm/domain/webhooks";
import { sendQueued, upsertRoute } from "@travel-crm/domain/inbox";
import { newUuidV7, systemActor } from "@travel-crm/domain/kernel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";
import { aWhatsApp, signer, WHATSAPP_KEY, WHATSAPP_TOKEN } from "./support/whatsapp.js";

describe("a WhatsApp message, end to end", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  const business = `9199${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const customer = `9187${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  const post = (body: string, headers: Record<string, string> = signer.headers, path = signer.path) =>
    server.app.request(path, { method: "POST", headers, body });
  const events = () => server.platform.webhookEvent.findMany({ where: { provider: "msg91-whatsapp" } });
  const processAll = async () => {
    for (const event of await events()) {
      await processWebhookEvent({ db: server.db, providers: [server.whatsapp?.provider ?? failing()] }, event.id);
    }
  };
  const failing = (): never => {
    throw new Error("no whatsapp");
  };

  beforeAll(async () => {
    server = createTestServer({}, { whatsappFor: aWhatsApp });
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    const connectionId = await server.db.forOrg(agency.organizationId, async (tx) => {
      const row = await tx.whatsappConnection.create({
        data: {
          integratedNumber: business,
          displayNumber: `+${business}`,
          mode: "new_number",
          status: "connected",
          connectedAt: new Date(),
        },
        select: { id: true },
      });
      return row.id;
    });
    await upsertRoute(server.db, { integratedNumber: business, organizationId: agency.organizationId, connectionId });
  });
  afterAll(() => server.close());

  it("answers a stranger with a bare 401 and stores nothing", async () => {
    const before = (await events()).length;
    const body = signer.body([
      signer.inbound({ integratedNumber: business, customerNumber: customer, wamid: "wamid.A", text: "hi" }),
    ]);
    expect((await post(body, { ...signer.headers, "x-travel-crm-key": "wrong".repeat(10) })).status).toBe(401);
    expect((await post(body, signer.headers, "/webhooks/msg91-whatsapp/not-the-token")).status).toBe(401);
    expect((await post(body, { "content-type": "application/json" })).status).toBe(401);
    // The internal header is the route's to set: a caller's own value on the generic path still has to be the token.
    expect(
      (
        await server.app.request("/webhooks/msg91-whatsapp", {
          method: "POST",
          headers: { ...signer.headers, "x-internal-path-token": "guess".repeat(8) },
          body,
        })
      ).status,
    ).toBe(401);
    expect((await events()).length).toBe(before);
  });

  it("answers 200 to anything carrying both secrets, even a body it cannot read or one that is too big", async () => {
    for (const body of ["not json", "", "[]", JSON.stringify({ unexpected: true })]) {
      expect((await post(body)).status).toBe(200);
    }
    expect((await post("x".repeat(70 * 1024))).status).toBe(200);
  });

  it("makes a lead and a chat from a first message, and shows them to the Owner", async () => {
    const body = signer.body([
      signer.inbound({
        integratedNumber: business,
        customerNumber: customer,
        wamid: `wamid.${randomUUID()}`,
        customerName: "Priya",
        text: "Goa in December?",
      }),
    ]);
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(200);
    await processAll();
    const leads = await server.db.forOrg(agency.organizationId, (tx) =>
      tx.lead.findMany({ include: { person: true } }),
    );
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ source: "whatsapp" });

    const status = await dataOf<InboxStatus>(await query(server, "inbox.status", owner));
    expect(status).toMatchObject({ configured: true, connected: true, connectionStatus: "connected" });
    const list = await dataOf<ConversationPage>(
      await query(server, "inbox.conversations", owner, { filter: "waiting" }),
    );
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      name: "Priya",
      needsReply: true,
      preview: "Goa in December?",
      isNewNumber: false,
    });
    const id = list.items[0]?.id ?? "";
    const header = await dataOf<ConversationHeader>(
      await query(server, "inbox.conversation", owner, { conversationId: id }),
    );
    expect(header).toMatchObject({ pastCustomer: false, lead: { id: leads[0]?.id, open: true }, state: "open" });
    expect(header.windowOpenUntil).not.toBeNull();
    const messages = await dataOf<ChatMessagePage>(
      await query(server, "inbox.messages", owner, { conversationId: id }),
    );
    expect(messages.items.map((message) => message.body)).toEqual(["Goa in December?"]);
    const lead = await dataOf<{ conversationId: string | null }>(
      await query(server, "inbox.leadChat", owner, { leadId: leads[0]?.id }),
    );
    expect(lead.conversationId).toBe(id);
  });

  it("shows a salesperson only the chats of their own leads, and refuses a chat out of scope as not found", async () => {
    const sales = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, sales);
    const list = await dataOf<ConversationPage>(await query(server, "inbox.conversations", jar, { filter: "all" }));
    expect(list.items).toHaveLength(0);
    const ownerList = await dataOf<ConversationPage>(
      await query(server, "inbox.conversations", owner, { filter: "all" }),
    );
    const refused = await refusalOf(
      await query(server, "inbox.conversation", jar, { conversationId: ownerList.items[0]?.id }),
    );
    expect(refused.status).toBe(404);
  });

  it("sends a reply once through the worker's sender, shows the ticks as reports arrive, and refuses a stranger", async () => {
    const list = await dataOf<ConversationPage>(await query(server, "inbox.conversations", owner, { filter: "all" }));
    const conversationId = list.items[0]?.id ?? "";
    const clientToken = randomUUID();
    const first = await dataOf<{ messageId: string; status: string }>(
      await mutate(server, "inbox.send", { conversationId, clientToken, text: "Hello Priya" }, owner),
    );
    const twin = await dataOf<{ messageId: string }>(
      await mutate(server, "inbox.send", { conversationId, clientToken, text: "Hello Priya" }, owner),
    );
    expect(first.status).toBe("queued");
    expect(twin.messageId).toBe(first.messageId);

    const whatsapp = server.whatsapp;
    if (whatsapp === null) throw new Error("no whatsapp");
    whatsapp.memory.addNumber(business);
    const context = {
      actor: systemActor(agency.organizationId),
      forOrg: <T>(work: Parameters<typeof server.db.forOrg<T>>[1]) => server.db.forOrg(agency.organizationId, work),
    };
    const sender = {
      provider: whatsapp.memory,
      files: server.files,
      limiter: { hit: () => Promise.resolve({ allowed: true, remaining: 1, retryAfterSeconds: 0 }) },
      logger: server.logger,
      managers: () => Promise.resolve([]),
    };
    expect(await sendQueued(sender, context, { id: newUuidV7(), messageId: first.messageId }, new Date())).toBe("sent");
    const sentMessage = whatsapp.memory.sent.find((sent) => sent.text === "Hello Priya");
    expect(sentMessage).toBeDefined();
    const wamid = sentMessage?.wamid ?? "";
    for (const eventName of ["sent", "delivered", "read"] as const) {
      expect((await post(signer.body([whatsapp.memory.reportFor(wamid, eventName)]))).status).toBe(200);
    }
    await processAll();
    const messages = await dataOf<ChatMessagePage>(await query(server, "inbox.messages", owner, { conversationId }));
    const ours = messages.items.find((message) => message.id === first.messageId);
    expect(ours).toMatchObject({ direction: "out", origin: "staff_crm", status: "read", body: "Hello Priya" });
    expect(Object.values(messages.people)).toHaveLength(1);
    const waiting = await dataOf<ConversationPage>(
      await query(server, "inbox.conversations", owner, { filter: "waiting" }),
    );
    expect(waiting.items).toHaveLength(0);

    const sales = await addStaff(server, agency, { username: "meera", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, sales);
    const refused = await refusalOf(
      await mutate(server, "inbox.send", { conversationId, clientToken: randomUUID(), text: "Hi" }, jar),
    );
    expect(refused.status).toBe(404);
  });

  it("writes a template, picks up its approval, sends it, and keeps template writing from a salesperson", async () => {
    const whatsapp = server.whatsapp;
    if (whatsapp === null) throw new Error("no whatsapp");
    const draft = {
      name: "trip_update",
      language: "en",
      category: "utility",
      body: "Hello {{1}}, your {{2}} trip is on.",
      footer: null,
      variables: ["customer_name", "destination"],
      samples: ["Priya", "Goa"],
    };
    const created = await dataOf<{ templateId: string }>(
      await mutate(server, "whatsappTemplates.create", draft, owner),
    );
    whatsapp.memory.setTemplateStatus(business, "trip_update", "approved");
    await dataOf(await mutate(server, "whatsappTemplates.refresh", undefined, owner));
    const sendable = await dataOf<{ items: { id: string; status: string }[] }>(
      await query(server, "whatsappTemplates.sendable", owner),
    );
    expect(sendable.items).toEqual([expect.objectContaining({ id: created.templateId, status: "approved" })]);
    const list = await dataOf<ConversationPage>(await query(server, "inbox.conversations", owner, { filter: "all" }));
    const sent = await dataOf<{ status: string }>(
      await mutate(
        server,
        "inbox.sendTemplate",
        {
          conversationId: list.items[0]?.id,
          templateId: created.templateId,
          clientToken: randomUUID(),
          parameters: ["Priya", "Goa"],
          agreed: false,
        },
        owner,
      ),
    );
    expect(sent.status).toBe("queued");
    const sales = await addStaff(server, agency, { username: "kiran", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, sales);
    expect(
      (await refusalOf(await mutate(server, "whatsappTemplates.create", { ...draft, name: "other_one" }, jar))).status,
    ).toBe(403);
  });

  it("holds no secret in the log or the stored events' headers", async () => {
    const logged = JSON.stringify(server.logger.entries);
    expect(logged).not.toContain(WHATSAPP_TOKEN);
    expect(logged).not.toContain(WHATSAPP_KEY);
    for (const event of await events()) expect(JSON.stringify(event.headers)).not.toContain(WHATSAPP_KEY);
  });
});
