// The minute job's rule for a follow-up it reaches late (agent-worker.ts): one reached more than 5 minutes after its time
// is let go, asking the model nothing, but one the agent planned for the window's margin edge still goes when the job
// reaches it a few seconds late.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestInbox, testNow, type TestInbox } from "../inbox/support.js";
import { liteAgency } from "./lite/support/lite-agency.js";

const hour = 3_600_000;
const after = (ms: number) => new Date(testNow.getTime() + ms);

describe("the minute job's late follow-ups", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  type Agency = Awaited<ReturnType<typeof liteAgency>>;
  /** As a reply leaves the chat: answered, its follow-up planned for `at`. */
  const planFollowUp = (on: Agency, at: Date) =>
    on.inOrg(async (tx) => {
      await tx.whatsappConversation.updateMany({ where: { id: on.chat.id }, data: { needsReply: false } });
      await tx.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: { conversationId: on.chat.id, followUpAt: at },
        update: { followUpAt: at },
      });
    });
  const followUpAt = async (on: Agency) =>
    (await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }))).followUpAt;

  it("lets go a follow-up it reaches more than 5 minutes late, asking the model nothing", async () => {
    const on = await liteAgency(test);
    const due = after(4 * hour);
    await planFollowUp(on, due);
    expect(await on.nudges(new Date(due.getTime() + 10 * 60_000))).toBe(0);
    expect(await followUpAt(on)).toBeNull();
    expect(on.model.requests).toHaveLength(0);
  });

  it("still runs one planned for the margin's edge when it reaches it seconds late", async () => {
    const on = await liteAgency(test);
    // The customer wrote at 10:00 (testNow): the margin's edge is 09:00 the next day, exactly 23 hours on.
    const edge = after(23 * hour);
    await planFollowUp(on, edge);
    on.model.answer("Rahul, which trip would you like to go on?");
    expect(await on.nudges(new Date(edge.getTime() + 40_000))).toBe(1);
  });
});
