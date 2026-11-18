// "AI needs you" for one member: `mine` narrows the hand-overs and stage suggestions to the leads the member owns (and,
// for someone who manages the AI, the ones nobody owns), where `mine: false` keeps the whole scope.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handedOverChatsOf, stageSuggestionsOf } from "../../src/ai/index.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, freshPhone, type TestInbox } from "../inbox/support.js";

describe("what the AI needs from one member", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function world() {
    const { organizationId } = await aConnectedAgency(test);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const connectionId = await inOrg(async (tx) => (await tx.whatsappConnection.findFirstOrThrow()).id);
    const seller = memberOf(organizationId, "sales");
    const manager = memberOf(organizationId, "org-admin");
    const colleague = randomUUID();
    // A customer with one lead (owner as given, or none), a handed-over chat and an open suggestion on it.
    const customer = (ownerUserId: string | null, at: string) =>
      inOrg(async (tx) => {
        const person = await aPerson(tx);
        const lead = await aLead(tx, { personId: person.id, ownerUserId, stage: "new" });
        const chat = await tx.whatsappConversation.create({
          data: { connectionId, personId: person.id, phoneE164: freshPhone(), needsReply: true },
          select: { id: true },
        });
        await tx.aiChat.create({
          data: { conversationId: chat.id, handedOffAt: new Date(at), handoffReason: "Wants a discount" },
        });
        await tx.leadAiSuggestion.create({
          data: {
            leadId: lead.id,
            conversationId: chat.id,
            kind: "lost",
            reason: "Not interested",
            createdAt: new Date(at),
          },
        });
        return { chatId: chat.id, leadId: lead.id };
      });
    return { inOrg, seller, manager, colleague, customer };
  }

  it("mine shows a salesperson the chats and suggestions on leads they own", async () => {
    const on = await world();
    const own = await on.customer(on.seller.userId, "2026-11-01T10:00:00Z");
    await on.customer(on.colleague, "2026-11-02T10:00:00Z");
    await on.customer(null, "2026-11-03T10:00:00Z");
    const chats = await on.inOrg((tx) => handedOverChatsOf(tx, on.seller, { mine: true }));
    const suggestions = await on.inOrg((tx) => stageSuggestionsOf(tx, on.seller, { mine: true }));
    expect(chats.map((chat) => chat.conversationId)).toEqual([own.chatId]);
    expect(suggestions.map((one) => one.leadId)).toEqual([own.leadId]);
  });

  it("mine also shows a manager the ones on leads nobody owns", async () => {
    const on = await world();
    const own = await on.customer(on.manager.userId, "2026-11-01T10:00:00Z");
    await on.customer(on.colleague, "2026-11-02T10:00:00Z");
    const unowned = await on.customer(null, "2026-11-03T10:00:00Z");
    const chats = await on.inOrg((tx) => handedOverChatsOf(tx, on.manager, { mine: true }));
    const suggestions = await on.inOrg((tx) => stageSuggestionsOf(tx, on.manager, { mine: true }));
    expect(chats.map((chat) => chat.conversationId)).toEqual([unowned.chatId, own.chatId]);
    expect(suggestions.map((one) => one.leadId)).toEqual([unowned.leadId, own.leadId]);
  });

  it("mine false keeps the whole scope", async () => {
    const on = await world();
    await on.customer(on.manager.userId, "2026-11-01T10:00:00Z");
    await on.customer(on.colleague, "2026-11-02T10:00:00Z");
    expect(await on.inOrg((tx) => handedOverChatsOf(tx, on.manager, { mine: false }))).toHaveLength(2);
    expect(await on.inOrg((tx) => stageSuggestionsOf(tx, on.manager, { mine: false }))).toHaveLength(2);
  });
});
