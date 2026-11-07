// A chat's facts: saved and read back as they were, a row that doesn't parse reads as empty, and an erasure takes them.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { chatFacts } from "@travel-crm/contracts/ai";
import { readFacts, saveFacts } from "../../../src/ai/grounded/facts.js";
import { systemActor } from "../../../src/kernel/index.js";
import { eraseCustomerParts } from "../../../src/platform/erase-customer.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../../inbox/support.js";

describe("a chat's facts", () => {
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

  async function chat() {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    await deliver(
      test,
      fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), customerName: "Rahul", text: "Hi" }),
    );
    const conversation = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    return { organizationId, inOrg, conversationId: conversation.id, personId: conversation.personId ?? "" };
  }

  it("facts round-trip and a bad row reads as empty", async () => {
    const { inOrg, conversationId } = await chat();
    expect((await inOrg((tx) => readFacts(tx, conversationId))).places).toEqual([]);
    const facts = {
      ...chatFacts.parse({}),
      places: [{ destinationId: null, words: "Spiti" }],
      notRun: ["Spiti"],
      month: "2026-12",
      travellers: 4,
      budgetPaise: 5_000_000,
    };
    await inOrg((tx) => saveFacts(tx, conversationId, facts));
    expect(await inOrg((tx) => readFacts(tx, conversationId))).toEqual(facts);
    await inOrg((tx) => tx.aiChat.updateMany({ where: { conversationId }, data: { facts: { month: 7 } } }));
    expect(await inOrg((tx) => readFacts(tx, conversationId))).toEqual(chatFacts.parse({}));
  });

  it("erasing a customer clears their chat facts", async () => {
    const { organizationId, inOrg, conversationId, personId } = await chat();
    await inOrg((tx) => saveFacts(tx, conversationId, chatFacts.parse({ pickupCity: "Rahul's flat, Andheri" })));
    expect(await inOrg((tx) => tx.aiChat.count({ where: { conversationId } }))).toBe(1);
    await platformDb.transaction((tx) =>
      eraseCustomerParts(tx, systemActor(organizationId), { organizationId, personId }, testNow),
    );
    expect(await inOrg((tx) => tx.aiChat.count())).toBe(0);
    expect(await inOrg((tx) => readFacts(tx, conversationId))).toMatchObject({ pickupCity: null });
  });
});
