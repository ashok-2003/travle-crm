// Suggest reply: off until the agency turns it on; a chat the member may not see is not found; the draft is made from the chat,
// the lead and the agency's own words, with no contact details; the monthly limit holds and is given back when the AI doesn't
// answer; a draft keeps ids and a hash, never its words; and a reply sent from it is audited as drafted by AI.
import { randomUUID } from "node:crypto";
import { createMemoryAiModel, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MONTHLY_SUGGESTION_LIMIT,
  aiSettingsOf,
  recordDraftSent,
  saveAiSettings,
  suggestReply,
} from "../../src/ai/index.js";
import { createQuickReply } from "../../src/inbox/index.js";
import { monthStartOf } from "../../src/inbox/index.js";
import { aLead } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestConnection,
  type TestInbox,
} from "../inbox/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

describe("suggest reply", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** An agency whose customer has written, with an Owner and a Sales member who owns the customer's lead. */
  async function agency(text = "Hi, I want a Manali trip for 4 adults in December. What is the price?") {
    const connection: TestConnection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberOf(organizationId, "org-owner");
    const seller = memberOf(organizationId, "sales");
    const outsider = memberOf(organizationId, "sales");
    const customerNumber = freshPhone().replace("+", "");
    await deliver(test, fromCustomer(connection, { customerNumber, customerName: "Rahul Sharma", text }));
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    await inOrg((tx) =>
      aLead(tx, {
        ...(chat.personId === null ? {} : { personId: chat.personId }),
        ownerUserId: seller.userId,
        stage: "contacted",
      }),
    );
    const model = createMemoryAiModel();
    const turnOn = (instructions = "") =>
      inOrg((tx) => saveAiSettings(tx, owner, { enabled: true, instructions }, { providerReady: true, now: testNow }));
    const ask = (member = seller, ai: MemoryAiModel = model) =>
      suggestReply(test.db, ai, member, { conversationId: chat.id }, { agencyName: "Sharma Holidays", now: testNow });
    return { organizationId, inOrg, owner, seller, outsider, chat, model, turnOn, ask };
  }

  it("is off until the agency turns it on, and asks the AI nothing while off", async () => {
    const { ask, model, inOrg, owner, organizationId } = await agency();
    expect(await reasonOf(ask())).toBe("AI_OFF");
    expect(model.requests).toHaveLength(0);
    const settings = await inOrg((tx) => aiSettingsOf(tx, { organizationId, providerReady: true, now: testNow }));
    expect(settings).toMatchObject({ enabled: false, usedThisMonth: 0, monthlyLimit: MONTHLY_SUGGESTION_LIMIT });
    expect(owner.userId).toBeDefined();
  });

  it("audits turning it on, without the instructions' words", async () => {
    const { turnOn, inOrg } = await agency();
    await turnOn("Never offer discounts. Reply in Hinglish.");
    const entries = await inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai-settings.changed" } }));
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries[0])).not.toContain("Hinglish");
    expect(entries[0]).toMatchObject({ after: { enabled: true, instructionsLength: 41 } });
  });

  it("drafts from the chat, the lead and the agency's words, with no contact details, and keeps no words", async () => {
    const { ask, model, turnOn, inOrg, organizationId, owner, chat } = await agency();
    await turnOn("Never offer discounts.");
    await inOrg((tx) =>
      createQuickReply(tx, owner, { shortcut: "hello", title: "Greeting", body: "Namaste from Sharma Holidays!" }),
    );
    model.answer('"Namaste Rahul! For 4 adults in December, may I know your departure city?"');
    const draft = await ask();
    expect(draft.text).toBe("Namaste Rahul! For 4 adults in December, may I know your departure city?");
    expect(draft).toMatchObject({ usedThisMonth: 1, monthlyLimit: MONTHLY_SUGGESTION_LIMIT });

    const [request] = model.requests;
    expect(request).toMatchObject({ feature: "suggest_reply", user: organizationId });
    const prompt = request?.messages.map((message) => message.content).join("\n") ?? "";
    expect(prompt).toContain("Never offer discounts.");
    expect(prompt).toContain("Namaste from Sharma Holidays!");
    expect(prompt).toContain("Manali trip for 4 adults");
    expect(prompt).toContain("Rahul");
    expect(prompt).not.toContain("Sharma Rahul");
    expect(prompt).not.toContain(chat.phoneE164);

    const row = await inOrg((tx) => tx.aiDraft.findUniqueOrThrow({ where: { id: draft.draftId } }));
    expect(JSON.stringify(row)).not.toContain("Namaste");
    expect(row).toMatchObject({ conversationId: chat.id, draftedBy: expect.any(String) as string });
  });

  it("is not found for a chat the member may not see", async () => {
    const { ask, turnOn, outsider, model } = await agency();
    await turnOn();
    expect(await reasonOf(ask(outsider))).toBe("NOT_FOUND");
    expect(model.requests).toHaveLength(0);
  });

  it("stops at the monthly limit and says so, then gives a suggestion back when the AI doesn't answer", async () => {
    const { ask, turnOn, inOrg, model } = await agency();
    await turnOn();
    await inOrg((tx) =>
      tx.aiUsage.create({
        data: { month: monthStartOf(testNow, "Asia/Kolkata"), suggestions: MONTHLY_SUGGESTION_LIMIT },
      }),
    );
    expect(await reasonOf(ask())).toBe("AI_MONTH_LIMIT");
    expect(model.requests).toHaveLength(0);

    await inOrg((tx) => tx.aiUsage.updateMany({ data: { suggestions: 10 } }));
    model.answer({ ok: false, reason: "unavailable" });
    expect(await reasonOf(ask())).toBe("AI_UNAVAILABLE");
    expect((await inOrg((tx) => tx.aiUsage.findFirstOrThrow())).suggestions).toBe(10);
    model.answer({ ok: false, reason: "rate_limited" });
    expect(await reasonOf(ask())).toBe("AI_BUSY");
    expect((await inOrg((tx) => tx.aiUsage.findFirstOrThrow())).suggestions).toBe(10);
  });

  it("never passes the limit when two suggestions are asked for at once", async () => {
    const { ask, turnOn, inOrg, model } = await agency();
    await turnOn();
    await inOrg((tx) =>
      tx.aiUsage.create({
        data: { month: monthStartOf(testNow, "Asia/Kolkata"), suggestions: MONTHLY_SUGGESTION_LIMIT - 1 },
      }),
    );
    model.answer("One", "Two");
    const results = await Promise.allSettled([ask(), ask()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await inOrg((tx) => tx.aiUsage.findFirstOrThrow())).suggestions).toBe(MONTHLY_SUGGESTION_LIMIT);
  });

  describe("a reply sent from a draft", () => {
    it("is audited as drafted by AI, sent by the member, and whether they changed it", async () => {
      const { ask, turnOn, inOrg, seller, model, chat } = await agency();
      await turnOn();
      model.answer("Which dates are you travelling?", "Share your budget please");
      const first = await ask();
      const second = await ask();
      const send = (draftId: string, text: string) =>
        inOrg((tx) =>
          recordDraftSent(tx, seller, { draftId, conversationId: chat.id, messageId: randomUUID(), text }, testNow),
        );
      await send(first.draftId, first.text);
      await send(second.draftId, "Share your budget and dates please");
      await send(second.draftId, "Share your budget and dates please");
      const entries = await inOrg((tx) =>
        tx.auditEntry.findMany({ where: { action: "ai.draft-sent" }, orderBy: { id: "asc" } }),
      );
      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => (entry.after as { changedByMember: boolean }).changedByMember)).toEqual([
        false,
        true,
      ]);
      expect(entries.every((entry) => entry.actorUserId === seller.userId)).toBe(true);
      expect(JSON.stringify(entries)).not.toContain("budget");
    });

    it("is refused for a draft that is not the member's or not this chat's, so the audit never lies", async () => {
      const { ask, turnOn, inOrg, seller, owner, model, chat } = await agency();
      await turnOn();
      model.answer("A draft");
      const draft = await ask();
      const attempt = (member: typeof seller, conversationId: string) =>
        reasonOf(
          inOrg((tx) =>
            recordDraftSent(
              tx,
              member,
              { draftId: draft.draftId, conversationId, messageId: randomUUID(), text: "x" },
              testNow,
            ),
          ),
        );
      expect(await attempt(owner, chat.id)).toBe("NOT_FOUND");
      expect(await attempt(seller, randomUUID())).toBe("NOT_FOUND");
      expect(await inOrg((tx) => tx.auditEntry.count({ where: { action: "ai.draft-sent" } }))).toBe(0);
    });
  });
});
