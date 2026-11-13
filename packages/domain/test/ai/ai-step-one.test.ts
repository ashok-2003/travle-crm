// The AI's knowledge and its guess of how a lead will go: knowledge typed or read from a document and given to the AI as data,
// deleted with its file; the scoring queued and run only for an agency with the AI on, a plan that has it and a subscription
// that isn't suspended or cancelled, never moving a stage, within the monthly limit, once for a burst of messages, and erased
// with the customer. Against the real database, under row-level security.
import { randomUUID } from "node:crypto";
import { AI_KNOWLEDGE_RECORD_TYPE } from "@travel-crm/contracts/files";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  addKnowledge,
  aiAllowed,
  aiDocumentListener,
  confirmDocument,
  deleteKnowledge,
  chatAiOf,
  leadInsightOf,
  listKnowledge,
  MONTHLY_AI_LIMIT,
  requestDocument,
  aiSettingsOf,
  saveAiSettings,
  scoreHandler,
  scoreLead,
  scoreOnCustomerWroteListener,
  setLiteAgent,
  suggestReply,
  updateKnowledge,
} from "../../src/ai/index.js";
import { monthStartOf } from "../../src/inbox/index.js";
import type { DomainEvent } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { eraseCustomerParts } from "../../src/platform/erase-customer.js";
import type { Entitlements } from "../../src/subscriptions/index.js";
import { aLead } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../inbox/support.js";

const entitlements = (status: Entitlements["status"] = "active", modules = ["crm", "inbox", "ai"]): Entitlements => ({
  status,
  access: "full",
  planName: "Test",
  modules: new Set(modules) as Entitlements["modules"],
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
});
const answer = {
  score: 82,
  label: "hot",
  reasons: ["Asked for the price", "Gave dates"],
  fake: false,
  fakeReason: "",
  summary: "Wants Manali in December for four adults and has asked the price.",
  nextStep: "Call today with the Manali package.",
  facts: { destination: "Manali", when: "December", travellers: "4 adults", budget: null },
};

describe("the AI, step one", () => {
  let test: TestInbox;
  let platformDb: PlatformDatabase;
  beforeAll(() => {
    test = createTestInbox();
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  /** An agency whose customer has written, with a lead; the AI on unless told. */
  async function agency({ on = true, text = "Hi, Manali for 4 adults in December. What is the price?" } = {}) {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberOf(organizationId, "org-owner");
    await deliver(
      test,
      fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), customerName: "Rahul Sharma", text }),
    );
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
    const lead = await inOrg((tx) =>
      aLead(tx, {
        ...(chat.personId === null ? {} : { personId: chat.personId }),
        ownerUserId: owner.userId,
        stage: "contacted",
      }),
    );
    if (on)
      await inOrg((tx) =>
        saveAiSettings(
          tx,
          owner,
          { enabled: true, scoring: true, instructions: "" },
          { providerReady: true, now: testNow },
        ),
      );
    const model = createMemoryAiModel();
    const job = { organizationId, conversationId: chat.id, messageId: message.id };
    const score = (status: Entitlements["status"] = "active", modules?: string[]) =>
      scoreLead(
        {
          db: test.db,
          ai: model,
          subscriptions: { entitlementsOf: () => Promise.resolve(entitlements(status, modules)) },
        },
        job,
        testNow,
      );
    return { organizationId, inOrg, owner, chat, message, lead, model, job, score };
  }

  describe("the chat's notes on the customer", () => {
    async function scoredLead() {
      const setup = await agency();
      setup.model.answer(JSON.stringify(answer));
      await setup.score();
      return setup;
    }
    it("reads the notes of the chat the person wrote in last", async () => {
      const { inOrg, chat, lead } = await scoredLead();
      await inOrg((tx) => tx.aiChat.create({ data: { conversationId: chat.id, summary: "Older number's notes." } }));
      const newer = await inOrg((tx) =>
        tx.whatsappConversation.create({
          data: {
            connectionId: chat.connectionId,
            phoneE164: freshPhone(),
            personId: chat.personId,
            lastInboundAt: new Date(testNow.getTime() + 60_000),
          },
        }),
      );
      await inOrg((tx) => tx.aiChat.create({ data: { conversationId: newer.id, summary: "Newer number's notes." } }));
      expect((await inOrg((tx) => leadInsightOf(tx, lead.id)))?.chatSummary).toBe("Newer number's notes.");
    });

    it("is null when the notes are empty", async () => {
      const { inOrg, chat, lead } = await scoredLead();
      expect((await inOrg((tx) => leadInsightOf(tx, lead.id)))?.chatSummary).toBeNull();
      await inOrg((tx) => tx.aiChat.create({ data: { conversationId: chat.id, summary: "" } }));
      expect((await inOrg((tx) => leadInsightOf(tx, lead.id)))?.chatSummary).toBeNull();
    });

    it("is what the chat's AI state carries", async () => {
      const { inOrg, chat } = await scoredLead();
      await inOrg((tx) => tx.aiChat.create({ data: { conversationId: chat.id, summary: "Likes quiet places." } }));
      expect((await inOrg((tx) => chatAiOf(tx, chat.id, true))).summary).toBe("Likes quiet places.");
    });
  });

  describe("knowledge", () => {
    it("is added, changed and turned off, audited by length and never by words, and given to Suggest reply as data", async () => {
      const { inOrg, owner, model, chat, organizationId } = await agency();
      await inOrg((tx) => addKnowledge(tx, owner, { title: "Manali 5N", body: "Manali 5N/6D is ₹18,500 per person." }));
      await inOrg((tx) => addKnowledge(tx, owner, { title: "Old offer", body: "Goa at ₹9,999 (ended)." }));
      const [first, second] = (await inOrg((tx) => listKnowledge(tx))).sort((a, b) => a.title.localeCompare(b.title));
      await inOrg((tx) =>
        updateKnowledge(tx, owner, { knowledgeId: second?.id ?? "", title: "Old offer", body: "Goa", enabled: false }),
      );
      model.answer("Manali 5N/6D is ₹18,500 per person.");
      await suggestReply(
        test.db,
        model,
        owner,
        { conversationId: chat.id },
        { agencyName: "Sharma Holidays", now: testNow },
      );
      const prompt = model.requests[0]?.messages.map((message) => message.content).join("\n") ?? "";
      expect(prompt).toContain("Manali 5N/6D is ₹18,500 per person.");
      expect(prompt).not.toContain("Goa");
      expect(first?.id).toBeDefined();
      const entries = await inOrg((tx) =>
        tx.auditEntry.findMany({ where: { action: { startsWith: "ai.knowledge" } } }),
      );
      expect(entries).toHaveLength(3);
      expect(JSON.stringify(entries)).not.toContain("18,500");
      expect(organizationId).toBeDefined();
    });

    it("reads a document's words, and deleting it deletes its file too", async () => {
      const { organizationId, owner } = await agency();
      const dependencies = { db: test.db, files: test.files };
      const slot = await requestDocument(dependencies, owner, {
        title: "Price list",
        fileName: "prices.txt",
        contentType: "text/plain",
        sizeBytes: 22,
      });
      expect(slot.knowledgeId).toBeDefined();
      expect(organizationId).toBeDefined();
      await expect(
        confirmDocument(dependencies, owner, { knowledgeId: slot.knowledgeId, attachmentId: slot.attachmentId }),
      ).rejects.toBeDefined();
      // The file never reached storage here, so the upload isn't confirmed: the piece stays "reading", and removing it removes the attachment.
      const before = await test.db.forOrg(organizationId, (tx) => listKnowledge(tx));
      expect(before.find((item) => item.id === slot.knowledgeId)?.status).toBe("reading");
      await deleteKnowledge(dependencies, owner, slot.knowledgeId);
      expect(await test.db.forOrg(organizationId, (tx) => listKnowledge(tx))).toEqual([]);
      const kept = await test.files.list(owner, { recordType: AI_KNOWLEDGE_RECORD_TYPE, recordId: slot.knowledgeId });
      expect(kept).toEqual([]);
    });

    it("keeps the piece when its file can't be removed, so a retry still finds it", async () => {
      const { organizationId, owner } = await agency();
      const slot = await requestDocument({ db: test.db, files: test.files }, owner, {
        title: "Brochure",
        fileName: "b.txt",
        contentType: "text/plain",
        sizeBytes: 5,
      });
      const failing = {
        ...test.files,
        remove: () => Promise.reject(new Error("storage is down")),
      } as typeof test.files;
      await expect(deleteKnowledge({ db: test.db, files: failing }, owner, slot.knowledgeId)).rejects.toThrow(
        "storage is down",
      );
      expect((await test.db.forOrg(organizationId, (tx) => listKnowledge(tx))).map((item) => item.id)).toContain(
        slot.knowledgeId,
      );
      await deleteKnowledge({ db: test.db, files: test.files }, owner, slot.knowledgeId);
      expect(await test.db.forOrg(organizationId, (tx) => listKnowledge(tx))).toEqual([]);
    });

    it("marks a document failed when it has no words to read", async () => {
      const { organizationId, owner } = await agency();
      const slot = await requestDocument({ db: test.db, files: test.files }, owner, {
        title: "Scan",
        fileName: "scan.pdf",
        contentType: "application/pdf",
        sizeBytes: 10,
      });
      const listener = aiDocumentListener({
        files: {
          systemFile: () => Promise.resolve({ body: new Uint8Array(), contentType: "application/pdf" }),
        } as never,
        readText: () => Promise.resolve(null),
      });
      const event: DomainEvent = {
        id: randomUUID(),
        organizationId,
        type: "ai.document-added",
        payload: { knowledgeId: slot.knowledgeId },
        occurredAt: testNow,
      };
      await listener.handle(event, {
        actor: systemActor(organizationId),
        forOrg: (work) => test.db.forOrg(organizationId, work),
      });
      const items = await test.db.forOrg(organizationId, (tx) => listKnowledge(tx));
      expect(items.find((item) => item.id === slot.knowledgeId)?.status).toBe("failed");
    });
  });

  describe("the lead's guess", () => {
    it("is queued only for an agency with the AI on, and a plan with it", async () => {
      const on = await agency();
      const off = await agency({ on: false });
      const event = (organizationId: string, conversationId: string, messageId: string): DomainEvent => ({
        id: randomUUID(),
        organizationId,
        type: "whatsapp.text-received",
        payload: { conversationId, messageId },
        occurredAt: testNow,
      });
      for (const [subject, modules] of [
        [on, ["crm", "ai"]],
        [off, ["crm", "ai"]],
        [on, ["crm"]],
      ] as const) {
        const queue = test.queue;
        const before = queue.sent.length;
        const listener = scoreOnCustomerWroteListener({
          queue,
          ai: on.model,
          subscriptions: { entitlementsOf: () => Promise.resolve(entitlements("active", [...modules])) },
        });
        await listener.handle(event(subject.organizationId, subject.chat.id, subject.message.id), {
          actor: systemActor(subject.organizationId),
          forOrg: (work) => test.db.forOrg(subject.organizationId, work),
        });
        const queued = queue.sent.length - before;
        expect(queued, `${subject === on ? "on" : "off"} ${modules.join(",")}`).toBe(
          subject === on && (modules as readonly string[]).includes("ai") ? 1 : 0,
        );
      }
    });

    it("is not queued once the agency turned scoring off", async () => {
      const { organizationId, inOrg, owner, model, chat, message } = await agency();
      await inOrg((tx) =>
        saveAiSettings(
          tx,
          owner,
          { enabled: true, scoring: false, fillLeads: false, instructions: "" },
          { providerReady: true, now: testNow },
        ),
      );
      const before = test.queue.sent.length;
      const listener = scoreOnCustomerWroteListener({
        queue: test.queue,
        ai: model,
        subscriptions: { entitlementsOf: () => Promise.resolve(entitlements()) },
      });
      await listener.handle(
        {
          id: randomUUID(),
          organizationId,
          type: "whatsapp.text-received",
          payload: { conversationId: chat.id, messageId: message.id },
          occurredAt: testNow,
        },
        { actor: systemActor(organizationId), forOrg: (work) => test.db.forOrg(organizationId, work) },
      );
      expect(test.queue.sent.length - before).toBe(0);
    });

    it("scores a lead from its chat, keeps the guess, and never moves the stage", async () => {
      const { inOrg, lead, model, score } = await agency();
      model.answer(JSON.stringify(answer));
      expect(await score()).toBe("scored");
      const request = model.requests[0];
      expect(request).toMatchObject({ feature: "score_lead", json: true });
      expect(JSON.stringify(request?.messages)).not.toMatch(/\+91\d{8}/);
      const row = await inOrg((tx) => tx.leadAiInsight.findFirstOrThrow({ where: { leadId: lead.id } }));
      expect(row).toMatchObject({
        score: 82,
        label: "hot",
        fake: false,
        summary: "Wants Manali in December for four adults and has asked the price.",
      });
      expect((await inOrg((tx) => leadInsightOf(tx, lead.id)))?.summary).toBe(row.summary);
      expect((await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: lead.id } }))).stage).toBe("contacted");
    });

    it("scores nothing, and asks the AI nothing, once the agency turned scoring off", async () => {
      const { organizationId, inOrg, owner, model, score } = await agency();
      await inOrg((tx) =>
        saveAiSettings(
          tx,
          owner,
          { enabled: true, scoring: false, fillLeads: false, instructions: "" },
          { providerReady: true, now: testNow },
        ),
      );
      model.answer(JSON.stringify(answer));
      expect(await score()).toBe("off");
      expect(model.requests).toHaveLength(0);
      expect(await inOrg((tx) => tx.leadAiInsight.count())).toBe(0);
      expect(organizationId).toBeDefined();
    });

    it("does nothing, and asks the AI nothing, with the AI off, the plan without it, or the subscription suspended or cancelled", async () => {
      const off = await agency({ on: false });
      off.model.answer(JSON.stringify(answer));
      expect(await off.score()).toBe("off");
      const on = await agency();
      on.model.answer(JSON.stringify(answer));
      expect(await on.score("active", ["crm"])).toBe("not_allowed");
      expect(await on.score("suspended")).toBe("not_allowed");
      expect(await on.score("cancelled")).toBe("not_allowed");
      expect(on.model.requests).toHaveLength(0);
      expect(off.model.requests).toHaveLength(0);
      expect(await off.inOrg((tx) => tx.leadAiInsight.count())).toBe(0);
    });

    it("scores only a chat's newest customer message, so a burst is one call", async () => {
      const { inOrg, chat, model, job, score, organizationId } = await agency();
      await inOrg((tx) =>
        tx.whatsappMessage.create({
          data: {
            conversationId: chat.id,
            direction: "in",
            origin: "customer",
            kind: "text",
            body: "Also, do you do flights?",
            wamid: randomUUID(),
            status: "received",
            occurredAt: new Date(testNow.getTime() + 5000),
          },
        }),
      );
      model.answer(JSON.stringify(answer));
      expect(await score()).toBe("later_message");
      expect(model.requests).toHaveLength(0);
      expect(job.organizationId).toBe(organizationId);
    });

    it("reads a burst whole: real words with an ok at the end are scored, an ok alone is not", async () => {
      const { inOrg, chat, model, score, organizationId } = await agency();
      model.answer(JSON.stringify(answer));
      expect(await score()).toBe("scored");
      // Each line is written now: after the guess made before it, before the next one.
      const write = (body: string) =>
        inOrg((tx) =>
          tx.whatsappMessage.create({
            data: {
              conversationId: chat.id,
              direction: "in",
              origin: "customer",
              kind: "text",
              body,
              wamid: randomUUID(),
              status: "received",
              occurredAt: new Date(),
            },
            select: { id: true },
          }),
        );
      const scoreFor = (messageId: string) =>
        scoreLead(
          {
            db: test.db,
            ai: model,
            subscriptions: { entitlementsOf: () => Promise.resolve(entitlements("active")) },
          },
          { organizationId, conversationId: chat.id, messageId },
          testNow,
        );
      await write("We are six now, and want Kasol too");
      const trailingOk = await write("ok");
      model.answer(JSON.stringify(answer));
      expect(await scoreFor(trailingOk.id)).toBe("scored");
      const onlyThanks = await write("thanks 👍");
      expect(await scoreFor(onlyThanks.id)).toBe("nothing_new");
      expect(model.requests).toHaveLength(2);
    });

    it("stops at the monthly limit shared with Suggest reply, and gives the call back when the AI doesn't answer", async () => {
      const { inOrg, model, score } = await agency();
      await inOrg((tx) =>
        tx.aiUsage.create({ data: { month: monthStartOf(testNow, "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT } }),
      );
      expect(await score()).toBe("limit");
      expect(model.requests).toHaveLength(0);
      await inOrg((tx) => tx.aiUsage.updateMany({ data: { calls: 10 } }));
      model.answer({ ok: false, reason: "unavailable" });
      expect(await score()).toBe("no_answer");
      model.answer("not json at all");
      expect(await score()).toBe("no_answer");
      expect((await inOrg((tx) => tx.aiUsage.findFirstOrThrow())).calls).toBe(10);
    });

    /** The agency on the lite agent, its autopilot on, and the chat's AI row as given. */
    async function liteAgency(chat: { mode?: string; turnState?: string | null; turnAt?: Date }) {
      const on = await agency();
      await on.inOrg(async (tx) => {
        await setLiteAgent(tx, systemActor(on.organizationId), true);
        await tx.aiAutopilot.updateMany({ data: { autopilot: true } });
        await tx.aiChat.create({
          data: {
            conversationId: on.chat.id,
            mode: chat.mode ?? "default",
            turnState: chat.turnState ?? null,
            turnAt: chat.turnAt ?? null,
          },
        });
      });
      return on;
    }

    it("the scoring job waits for a lite turn under way, and skips a chat the turn already scored", async () => {
      const queued = await liteAgency({ turnState: "queued", turnAt: testNow });
      queued.model.answer(JSON.stringify(answer));
      expect(await queued.score()).toBe("turn_under_way");
      expect(queued.model.requests).toHaveLength(0);
      expect(await queued.inOrg((tx) => tx.aiUsage.count())).toBe(0);
      // Its turn is over and scored the lead after the customer's newest line: nothing is left to score.
      const scored = await liteAgency({});
      await scored.inOrg((tx) =>
        tx.leadAiInsight.create({
          data: { leadId: scored.lead.id, score: 40, label: "warm", summary: "", nextStep: "", model: "memory-model" },
        }),
      );
      expect(await scored.score()).toBe("agent_scores");
      expect(scored.model.requests).toHaveLength(0);
    });

    it("a lite chat whose turn ends without scoring (setup not ready) is still scored, a little later", async () => {
      const on = await liteAgency({ turnState: "thinking", turnAt: new Date() });
      const queue = createMemoryJobQueue();
      const logger = createMemoryLogger();
      const handler = scoreHandler({
        db: test.db,
        ai: on.model,
        subscriptions: { entitlementsOf: () => Promise.resolve(entitlements("active")) },
        logger,
        queue,
      });
      const before = Date.now();
      await handler.handle(on.job);
      expect(on.model.requests).toHaveLength(0);
      expect(queue.sent).toHaveLength(1);
      const [later] = queue.sent;
      expect(later).toMatchObject({ queue: "ai.score", data: { ...on.job, later: true } });
      const startAfter = later?.options.startAfter?.getTime() ?? 0;
      expect(startAfter - before).toBeGreaterThanOrEqual(2 * 60_000);
      // Its turn ends having written no score (the lite turn found the setup not ready).
      await on.inOrg((tx) => tx.aiChat.updateMany({ data: { turnState: null } }));
      on.model.answer(JSON.stringify(answer));
      await handler.handle(later?.data ?? {});
      expect(on.model.requests).toHaveLength(1);
      expect(await on.inOrg((tx) => tx.leadAiInsight.count({ where: { leadId: on.lead.id } }))).toBe(1);
      // Asked again for the same message, it re-queues nothing: one later run per message.
      await on.inOrg((tx) => tx.aiChat.updateMany({ data: { turnState: "thinking", turnAt: new Date() } }));
      await handler.handle(on.job);
      expect(queue.sent).toHaveLength(1);
    });

    it("a later run skips a chat its lite turn scored after the customer's newest line", async () => {
      const on = await liteAgency({});
      await on.inOrg((tx) =>
        tx.leadAiInsight.create({
          data: { leadId: on.lead.id, score: 40, label: "warm", summary: "", nextStep: "", model: "memory-model" },
        }),
      );
      const later = await scoreLead(
        {
          db: test.db,
          ai: on.model,
          subscriptions: { entitlementsOf: () => Promise.resolve(entitlements("active")) },
        },
        { ...on.job, later: true },
        new Date(),
      );
      expect(later).toBe("agent_scores");
      expect(on.model.requests).toHaveLength(0);
    });

    it("it still scores a chat with the AI off", async () => {
      const off = await liteAgency({ mode: "off", turnState: null });
      off.model.answer(JSON.stringify(answer));
      expect(await off.score()).toBe("scored");
      expect(off.model.requests).toHaveLength(1);
    });

    it("a turn the worker left behind long ago doesn't stop the scoring", async () => {
      const stale = await liteAgency({ turnState: "thinking", turnAt: new Date(testNow.getTime() - 4 * 60_000) });
      stale.model.answer(JSON.stringify(answer));
      expect(await stale.score()).toBe("scored");
      expect(stale.model.requests).toHaveLength(1);
    });

    it("is erased with the customer", async () => {
      const { inOrg, lead, model, score, organizationId, chat } = await agency();
      model.answer(JSON.stringify(answer));
      await score();
      expect(await inOrg((tx) => tx.leadAiInsight.count())).toBe(1);
      await platformDb.transaction((tx) =>
        eraseCustomerParts(tx, systemActor(organizationId), { organizationId, personId: chat.personId ?? "" }, testNow),
      );
      expect(await inOrg((tx) => tx.leadAiInsight.count({ where: { leadId: lead.id } }))).toBe(0);
    });
  });

  describe("the settings", () => {
    it("saves whether the agency plans custom trips", async () => {
      const { organizationId, inOrg, owner } = await agency();
      const context = { providerReady: true, now: testNow };
      expect((await inOrg((tx) => aiSettingsOf(tx, { organizationId, ...context }))).customTrips).toBe(false);
      const on = await inOrg((tx) =>
        saveAiSettings(tx, owner, { enabled: true, scoring: true, customTrips: true, instructions: "" }, context),
      );
      expect(on.customTrips).toBe(true);
      const unchanged = await inOrg((tx) =>
        saveAiSettings(tx, owner, { enabled: true, scoring: true, instructions: "" }, context),
      );
      expect(unchanged.customTrips).toBe(true);
      const off = await inOrg((tx) =>
        saveAiSettings(tx, owner, { enabled: true, scoring: true, customTrips: false, instructions: "" }, context),
      );
      expect(off.customTrips).toBe(false);
    });
  });

  describe("the lifecycle", () => {
    it("refuses a read-only agency too: a lapsed agency costs no AI", () => {
      expect(aiAllowed(entitlements("active"))).toBe(true);
      expect(aiAllowed(entitlements("trial"))).toBe(true);
      for (const status of ["read_only", "suspended", "cancelled"] as const)
        expect(aiAllowed(entitlements(status))).toBe(false);
    });
  });

  it("erases the drafts of a chat found by the customer's phone, though the chat names no person", async () => {
    const { inOrg, organizationId, chat, owner, model, lead } = await agency();
    model.answer("Draft");
    const draft = await suggestReply(
      test.db,
      model,
      owner,
      { conversationId: chat.id },
      { agencyName: "x", now: testNow },
    );
    await inOrg((tx) => tx.whatsappConversation.update({ where: { id: chat.id }, data: { personId: null } }));
    const person = await inOrg((tx) =>
      tx.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { personId: true } }),
    );
    await platformDb.transaction((tx) =>
      eraseCustomerParts(tx, systemActor(organizationId), { organizationId, personId: person.personId }, testNow),
    );
    expect(await inOrg((tx) => tx.aiDraft.count({ where: { id: draft.draftId } }))).toBe(0);
  });
});
