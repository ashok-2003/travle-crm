// What a chat in flight holds at the move to the one lite agent, and what becomes of it: an earlier agent's facts and
// memory (the lite turn starts from empty facts and the lead's fields), its open booking with no amount (a person's), a
// turn the release before queued (paused while every agency is), a reply it already sent (never sent twice), and an
// agency whose setup is unfinished (answers nothing). Nothing here deletes data: the earlier agents' memory stays, read
// by nothing.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { agentSetupOf, aiCustomerWroteListener, aiReplyHandler } from "../../../src/ai/index.js";
import { fixedText } from "../../../src/ai/lite/fixed-texts.js";
import { readLiteFacts } from "../../../src/ai/lite/merge.js";
import type { LiteTrace } from "../../../src/ai/lite/types.js";
import { systemActor } from "../../../src/kernel/index.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteEntitlements, liteTurnAt, liteToday } from "./support/lite-agency.js";
import { at, greeting, outbound, says, understood, written, type Agency } from "./support/turn-script.js";

describe("chats in flight at the move", () => {
  let test: TestInbox;
  let platform: PlatformClient;
  beforeAll(() => {
    test = createTestInbox();
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });
  afterEach(() => vi.useRealTimers());

  const dependenciesOf = (on: Agency) => ({
    db: test.db,
    identity: on.identity,
    ai: on.model,
    logger: on.logger,
    subscriptions: { entitlementsOf: () => Promise.resolve(liteEntitlements) },
    agencyName: () => Promise.resolve("Sharma Holidays"),
    files: test.files,
    managers: () => Promise.resolve([]),
  });
  /** Runs a queued job as the worker would, with the clock where the turn expects it. */
  async function runJob(on: Agency, messageId: string, now = liteTurnAt) {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    await aiReplyHandler(dependenciesOf(on)).handle({
      organizationId: on.organizationId,
      conversationId: on.chat.id,
      messageId,
    });
    vi.useRealTimers();
  }
  const outcomesOf = (on: Agency) =>
    on.logger.entries.filter((entry) => entry.msg === "The AI agent's turn").map((entry) => entry.outcome);

  it("an earlier agent's chat goes on with the lite agent", async () => {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      // What the grounded agent kept: facts with no lite mark, and the first agent's memory.
      await tx.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: {
          conversationId: on.chat.id,
          facts: { pickupCity: "Mumbai", adults: 2 },
          memory: "Wants Kedarnath for 2.",
        },
        update: { facts: { pickupCity: "Mumbai", adults: 2 }, memory: "Wants Kedarnath for 2." },
      });
      // A person typed the lead's city and place.
      await tx.lead.update({
        where: { id: on.leadId },
        data: { departureCity: "Pune", destinationId: on.destinationId },
      });
    });
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("replied");
    const facts = await on.inOrg((tx) => readLiteFacts(tx, on.chat.id));
    expect(facts.agent).toBe("lite");
    expect(facts.pickupCity).toBe("Pune");
    const chat = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(chat.memory).toBe("Wants Kedarnath for 2.");
    expect((await outbound(on))[0]?.body).not.toMatch(/where would you like to go|which place/i);
  });

  it("an earlier agent's open booking with no amount goes to a person", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.aiBooking.create({
        data: {
          leadId: on.leadId,
          conversationId: on.chat.id,
          summary: "Kedarnath for 2",
          details: { package: "Kedarnath", amount: "₹14,000" },
          status: "awaiting_payment",
        },
      }),
    );
    const token = await says(on, "how do I pay?", 30);
    on.model.answer(understood([["wants_to_book", "how do I pay"]]));
    const traces: LiteTrace[] = [];
    const sink = { record: (trace: LiteTrace) => Promise.resolve(void traces.push(trace)) };
    expect(await on.turn(at(60), { token, traces: sink })).toBe("handed_off");
    expect(traces[0]).toMatchObject({ outcome: "handed_off", reason: "has_booking" });
    const sent = await outbound(on);
    expect(sent.map((one) => one.body)).toEqual([fixedText("hand_over", "english", {}).text]);
    for (const one of sent) {
      expect(one.body).not.toContain("₹0");
      expect(one.clientToken).not.toMatch(/:(pay|qr)$/);
    }
  });

  it("an older no-amount booking still goes to a person when a newer one has an amount", async () => {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      await tx.aiBooking.create({
        data: {
          leadId: on.leadId,
          conversationId: on.chat.id,
          summary: "Kedarnath for 2",
          status: "awaiting_payment",
          createdAt: new Date(testNow.getTime() - 3_600_000),
        },
      });
      await tx.aiBooking.create({
        data: {
          leadId: on.leadId,
          conversationId: on.chat.id,
          summary: "Kedarnath for 3",
          status: "awaiting_payment",
          expectedPaise: 400_000n,
        },
      });
    });
    const token = await says(on, "how do I pay?", 30);
    on.model.answer(understood([["wants_to_book", "how do I pay"]]));
    const traces: LiteTrace[] = [];
    const sink = { record: (trace: LiteTrace) => Promise.resolve(void traces.push(trace)) };
    expect(await on.turn(at(60), { token, traces: sink })).toBe("handed_off");
    expect(traces[0]).toMatchObject({ reason: "has_booking" });
  });

  it("a turn queued before the deploy ends paused while every agency is paused", async () => {
    const on = await liteAgency(test);
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    await pauseAgency(on, true);
    await runJob(on, on.message.id);
    expect(outcomesOf(on)).toEqual(["paused"]);
    expect(await outbound(on)).toHaveLength(0);
    expect(on.model.requests).toHaveLength(0);
  });

  it("a reply the earlier agent sent before the deploy is not sent again", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: on.chat.id,
          direction: "out",
          origin: "automation",
          kind: "text",
          body: "Namaste! Kedarnath is Rs 14,000.",
          status: "sent",
          clientToken: `ai:${on.message.id}`,
          occurredAt: new Date(testNow.getTime() + 20_000),
        },
      }),
    );
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    await runJob(on, on.message.id);
    expect(outcomesOf(on)).toEqual(["answered"]);
    expect(await outbound(on)).toHaveLength(1);
  });

  it("an agency moved with its setup unfinished answers nothing", async () => {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      // The earlier agent's own payment text, but no agency payment details (and no QR).
      await tx.aiAutopilot.updateMany({ data: { grounded: true, paymentDetails: "UPI: old@bank" } });
      await tx.organizationProfile.updateMany({
        data: { upiId: null, bankName: null, bankAccountName: null, bankAccountNumber: null, bankIfsc: null },
      });
      await tx.attachment.updateMany({ where: { recordType: "agency_payment_qr" }, data: { deletedAt: new Date() } });
    });
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    const before = test.queue.sent.length;
    const dependencies = dependenciesOf(on);
    await aiCustomerWroteListener({ queue: test.queue, subscriptions: dependencies.subscriptions }).handle(
      {
        id: randomUUID(),
        organizationId: on.organizationId,
        type: "whatsapp.customer-wrote",
        payload: { conversationId: on.chat.id, messageId: on.message.id, firstEver: false },
        occurredAt: testNow,
      },
      { actor: systemActor(on.organizationId), forOrg: (work) => on.inOrg(work) },
    );
    expect(test.queue.sent.slice(before).map((job) => job.queue)).toEqual(["ai.reply"]);
    await runJob(on, on.message.id);
    expect(outcomesOf(on)).toEqual(["not_ready"]);
    expect(await outbound(on)).toHaveLength(0);
    expect(on.model.requests).toHaveLength(0);
    // Nothing ever said the AI had the message: no "queued" mark, then no "thinking" one left behind.
    const chat = await on.inOrg((tx) => tx.aiChat.findFirst());
    expect(chat?.turnState ?? null).toBeNull();
    const setup = await on.inOrg((tx) => agentSetupOf(tx, on.organizationId, liteToday));
    expect(setup).toMatchObject({ on: true, ready: false });
    expect(setup.steps.find((step) => step.key === "payment")?.done).toBe(false);
  });

  /** Pauses (or resumes) the agency's agent as platform staff do. */
  async function pauseAgency(on: Agency, paused: boolean) {
    const plan = await platform.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000n,
        modules: ["crm", "inbox", "ai"],
      },
    });
    await platform.subscription.create({
      data: {
        organizationId: on.organizationId,
        planId: plan.id,
        billingCycle: "monthly",
        status: "trial",
        statusChangedAt: testNow,
        trialEndsOn: new Date("2099-01-01"),
        ...(paused ? { aiAgentPausedAt: new Date(), aiAgentPausedBy: randomUUID() } : {}),
      },
    });
  }
});
