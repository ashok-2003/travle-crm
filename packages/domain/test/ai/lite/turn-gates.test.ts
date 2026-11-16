// The turn's gates as the natural agent asks for them (plan 2, ruling 5): the day's cap and the month's limit left to
// the caller, which hands the chat over at them, while every other gate still ends the turn as it does for lite.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/index.js";
import { turnGates } from "../../../src/ai/lite/turn-gates.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteTurnAt } from "./support/lite-agency.js";

describe("the turn's gates", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("leaves the day's cap and the month's limit to the caller when asked, and ends on a person answering", async () => {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      await tx.aiUsage.create({ data: { month: monthStartOf(liteTurnAt, "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT } });
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      const counted = {
        repliesOn: new Date(`${liteTurnAt.toISOString().slice(0, 10)}T00:00:00Z`),
        repliesCount: maxRepliesPerDay,
      };
      const state = await tx.aiChat.findFirst({ where: { conversationId: on.chat.id }, select: { id: true } });
      if (state === null) await tx.aiChat.create({ data: { conversationId: on.chat.id, ...counted } });
      else await tx.aiChat.update({ where: { id: state.id }, data: counted });
    });
    const turn = {
      organizationId: on.organizationId,
      conversationId: on.chat.id,
      kind: "reply",
      token: on.message.id,
    } as const;
    const gates = (options?: { limits?: boolean }) => on.inOrg((tx) => turnGates(tx, turn, liteTurnAt, options));
    expect(await gates()).toBe("day_limit");
    const passed = await gates({ limits: false });
    expect(typeof passed === "string" ? passed : passed.chat).toMatchObject({ id: on.chat.id, profileName: "Rahul" });
    // Someone on the team wrote just before the customer: mayWrite's last check, after the day's cap, still holds.
    await on.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: on.chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Checking the dates for you.",
          status: "sent",
          occurredAt: new Date(testNow.getTime() - 30_000),
        },
      }),
    );
    expect(await gates({ limits: false })).toBe("person_answering");
  });
});
