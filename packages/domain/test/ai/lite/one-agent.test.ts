// With one WhatsApp agent every turn is the lite turn, whatever an agency's old switches say: both queues run it, a
// customer's message queues on ai.reply, an AI follow-up task is the team's, and Try it is the lite dry run.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { aiCustomerWroteListener, aiReplyHandler, liteDryRun, type AgentDependencies } from "../../../src/ai/index.js";
import { systemActor } from "../../../src/kernel/index.js";
import { memberOf } from "../../imports/support/test-imports.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteEntitlements, liteTurnAt } from "./support/lite-agency.js";
import { greeting, outbound, understood, written, type Agency } from "./support/turn-script.js";

describe("one agent", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());
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

  it("every agency's turn is the lite turn, whatever its old switches say", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { lite: false, grounded: true } }));
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("replied");
    expect(on.model.requests[0]?.schema?.name).toBe("understand_form");
  });

  it("a turn queued on ai.reply, the one queue, answers as lite", async () => {
    const on = await liteAgency(test);
    const dependencies: AgentDependencies & { logger: typeof on.logger } = dependenciesOf(on);
    const handler = aiReplyHandler(dependencies);
    expect([handler.queue, handler.concurrency]).toEqual(["ai.reply", 3]);
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    // The handler reads the clock itself; only Date is faked, so the database and timers run as they do.
    vi.useFakeTimers({ now: liteTurnAt, toFake: ["Date"] });
    await handler.handle({ organizationId: on.organizationId, conversationId: on.chat.id, messageId: on.message.id });
    expect(on.model.requests[0]?.schema?.name).toBe("understand_form");
    expect(await outbound(on)).toHaveLength(1);
  });

  it("a customer's message queues its turn on ai.reply", async () => {
    const on = await liteAgency(test);
    const before = test.queue.sent.length;
    await aiCustomerWroteListener({ queue: test.queue, subscriptions: dependenciesOf(on).subscriptions }).handle(
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
  });

  it("an AI follow-up task that comes due is the team's", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.task.create({
        data: {
          kind: "follow-up",
          title: "Call about Kedarnath",
          dueAt: new Date(testNow.getTime() + 3_600_000),
          firstDueAt: new Date(testNow.getTime() + 3_600_000),
          recordType: "lead",
          recordId: on.leadId,
        },
      }),
    );
    expect(await on.nudges(new Date(testNow.getTime() + 2 * 3_600_000))).toBe(0);
    expect(await on.inOrg((tx) => tx.aiFollowUpTouch.count())).toBe(0);
    expect(await outbound(on)).toHaveLength(0);
  });

  it("Try it is the lite dry run", async () => {
    const on = await liteAgency(test, { ready: false });
    on.model.answer(understood([["discount", "discount"]]));
    await liteDryRun(
      { db: test.db, ai: on.model, agencyName: () => Promise.resolve("Sharma Holidays") },
      memberOf(on.organizationId, "org-owner"),
      "any discount?",
      testNow,
    );
    expect(on.model.requests[0]?.schema?.name).toBe("understand_form");
  });
});
