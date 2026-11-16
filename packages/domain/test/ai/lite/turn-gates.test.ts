// The turn's gates as the natural agent asks for them (plan 2, ruling 5): the day's cap and the month's limit handed
// back to the caller, which hands the chat over at them, while every other gate still ends the turn as it does for lite.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/index.js";
import { turnGates } from "../../../src/ai/lite/turn-gates.js";
import { replyDayOf } from "../../../src/ai/may-write.js";
import { monthStartOf } from "../../../src/inbox/index.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteTurnAt } from "./support/lite-agency.js";
import type { Agency } from "./support/turn-script.js";

const DAY_MS = 86_400_000;

describe("the turn's gates", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** The chat's reply count, kept for `day`; returns the agency's cap. */
  const counted = (on: Agency, day: Date, count?: number) =>
    on.inOrg(async (tx) => {
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      const data = { repliesOn: day, repliesCount: count ?? maxRepliesPerDay };
      const state = await tx.aiChat.findFirst({ where: { conversationId: on.chat.id }, select: { id: true } });
      if (state === null) await tx.aiChat.create({ data: { conversationId: on.chat.id, ...data } });
      else await tx.aiChat.update({ where: { id: state.id }, data });
      return maxRepliesPerDay;
    });
  const turnOf = (on: Agency) =>
    ({ organizationId: on.organizationId, conversationId: on.chat.id, kind: "reply", token: on.message.id }) as const;

  it("hands the day's cap and the month's limit back when asked, and still ends on a person answering", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(liteTurnAt, "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT } }),
    );
    const cap = await counted(on, replyDayOf(liteTurnAt));
    const turn = turnOf(on);
    expect(await on.inOrg((tx) => turnGates(tx, turn, liteTurnAt))).toBe("day_limit");
    expect(await on.inOrg((tx) => turnGates(tx, turn, liteTurnAt, { limits: false }))).toMatchObject({
      chat: { id: on.chat.id, profileName: "Rahul" },
      limits: { repliesToday: cap, dayCap: cap, monthFull: true },
    });
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
    expect(await on.inOrg((tx) => turnGates(tx, turn, liteTurnAt, { limits: false }))).toBe("person_answering");
  });

  it("counts the replies kept for today's reply day only, as the day's cap does", async () => {
    const on = await liteAgency(test);
    await counted(on, replyDayOf(new Date(liteTurnAt.getTime() - DAY_MS)));
    const turn = turnOf(on);
    expect(await on.inOrg((tx) => turnGates(tx, turn, liteTurnAt, { limits: false }))).toMatchObject({
      limits: { repliesToday: 0, monthFull: false },
    });
    await counted(on, replyDayOf(liteTurnAt), 3);
    expect(await on.inOrg((tx) => turnGates(tx, turn, liteTurnAt, { limits: false }))).toMatchObject({
      limits: { repliesToday: 3 },
    });
  });
});
