// The act's first check as the natural agent asks for it: the day's cap left to a hand-over at it (plan 2, ruling 5),
// and a reaction on our message counted as an answer to a follow-up (ruling 13); lite's act asks for neither.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stoppedSince, type ActGateInput } from "../../../src/ai/lite/act-gates.js";
import { chatRowOf, replyDayOf } from "../../../src/ai/may-write.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteTurnAt } from "./support/lite-agency.js";
import { greeting, type Agency } from "./support/turn-script.js";

describe("the act's first check", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const inputOf = (on: Agency, kind: ActGateInput["kind"], now: Date): ActGateInput => ({
    organizationId: on.organizationId,
    conversationId: on.chat.id,
    token: on.message.id,
    kind,
    now,
    timeZone: "Asia/Kolkata",
  });

  it("stops at the day's cap unless asked to leave it to the caller", async () => {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      const data = { repliesOn: replyDayOf(liteTurnAt), repliesCount: maxRepliesPerDay };
      const state = await tx.aiChat.findFirst({ where: { conversationId: on.chat.id }, select: { id: true } });
      if (state === null) await tx.aiChat.create({ data: { conversationId: on.chat.id, ...data } });
      else await tx.aiChat.update({ where: { id: state.id }, data });
    });
    const input = inputOf(on, "reply", liteTurnAt);
    const chat = chatRowOf(on.chat);
    expect(await on.inOrg((tx) => stoppedSince(tx, input, chat))).toBe("day_limit");
    expect(await on.inOrg((tx) => stoppedSince(tx, input, chat, { dayCap: false }))).toBeNull();
  });

  it("lets a follow-up go after a reaction on our reply unless asked to count it", async () => {
    const on = await liteAgency(test);
    on.model.answer(greeting);
    expect(await on.turn()).toBe("replied");
    await on.inOrg((tx) =>
      tx.whatsappMessage.updateMany({
        where: { conversationId: on.chat.id, direction: "out" },
        data: { reaction: "👍" },
      }),
    );
    // Four hours on, in the agency's waking hours and inside the window.
    const input = inputOf(on, "nudge", new Date(liteTurnAt.getTime() + 4 * 3_600_000));
    const chat = chatRowOf(on.chat);
    expect(await on.inOrg((tx) => stoppedSince(tx, input, chat))).toBeNull();
    expect(await on.inOrg((tx) => stoppedSince(tx, input, chat, { reactions: true }))).toBe("answered");
  });
});
