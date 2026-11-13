// An agent switched on whose setup comes undone answers nobody (plan 5's final review, I2): each turn ends not_ready
// with nothing sent. The agency's managers are told so once a day, in their bell and by email and push, with the way to
// the setup, so the silence never goes unnoticed. The notice holds no customer's words, and an agent switched off tells
// nobody: it was meant to be quiet.
import { AGENCY_PAYMENT_QR_RECORD_TYPE } from "@travel-crm/contracts/files";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAgentTurn } from "../../src/ai/index.js";
import { createTestInbox, testNow, type TestInbox } from "../inbox/support.js";
import { liteAgency, liteEntitlements, liteTurnAt } from "./lite/support/lite-agency.js";

type Agency = Awaited<ReturnType<typeof liteAgency>>;
const day = 24 * 3_600_000;

describe("the notice that the agent answers nobody", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** A reply turn as the worker runs it, with the agency's Owner as its manager. */
  const turn = (on: Agency, at: Date, token: string) =>
    runAgentTurn(
      {
        db: test.db,
        identity: on.identity,
        ai: on.model,
        logger: on.logger,
        subscriptions: { entitlementsOf: () => Promise.resolve(liteEntitlements) },
        agencyName: () => Promise.resolve("Sharma Holidays"),
        files: test.files,
        managers: () => Promise.resolve([on.owner.userId]),
      },
      { organizationId: on.organizationId, conversationId: on.chat.id, kind: "reply", token },
      at,
    );
  const notices = (on: Agency) =>
    on.inOrg((tx) =>
      tx.notification.findMany({ where: { kind: "ai.agent-not-ready" }, orderBy: { createdAt: "asc" } }),
    );
  const withoutQr = (on: Agency) =>
    on.inOrg((tx) =>
      tx.attachment.updateMany({
        where: { recordType: AGENCY_PAYMENT_QR_RECORD_TYPE },
        data: { deletedAt: new Date() },
      }),
    );

  it("tells the managers once a day, with the way to the setup and no customer's words", async () => {
    const on = await liteAgency(test);
    await withoutQr(on);
    expect(await turn(on, liteTurnAt, on.message.id)).toBe("not_ready");
    expect(await turn(on, new Date(liteTurnAt.getTime() + 60_000), on.message.id)).toBe("not_ready");
    const sent = await notices(on);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ recipientUserId: on.owner.userId, link: "/ai-agent?tab=setup" });
    expect(JSON.stringify(sent)).not.toMatch(/Kedarnath|Rahul/);
    // The bell's notice goes out by email and push too.
    const delivery = await on.inOrg((tx) =>
      tx.outboxEvent.findMany({ where: { type: "notification.created" }, select: { payload: true } }),
    );
    expect(delivery.map((event) => event.payload)).toContainEqual({
      notificationId: sent[0]?.id,
      channels: ["email", "push"],
    });

    // The next day, the customer writes again: one more notice.
    const nextDay = new Date(testNow.getTime() + day);
    await on.say("Any seats left?", "text", nextDay);
    const newest = await on.inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" }, orderBy: { occurredAt: "desc" } }),
    );
    expect(await turn(on, new Date(nextDay.getTime() + 60_000), newest.id)).toBe("not_ready");
    expect(await notices(on)).toHaveLength(2);
  });

  it("tells nobody when the agent is switched off", async () => {
    const on = await liteAgency(test);
    await withoutQr(on);
    await on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot: false } }));
    expect(await turn(on, liteTurnAt, on.message.id)).toBe("off");
    expect(await notices(on)).toEqual([]);
  });
});
