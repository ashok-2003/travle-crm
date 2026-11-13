// The lite agent's follow-ups against the real database, through the minute job: a reply plans the first, the first
// plans the second, and nothing plans a third; the customer's words stop them or start the count again; a pause, a
// person's reply or a take-over lets one go; a lead's follow-up task is the team's; the first agent keeps its one nudge.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { LiteTrace } from "../../../src/ai/lite/types.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { liteAgency, liteTurnAt } from "./support/lite-agency.js";
import { greeting, outbound, says, understood, withFacts, written, type Agency } from "./support/turn-script.js";

const hour = 3_600_000;
const after = (ms: number) => new Date(testNow.getTime() + ms);
/** The customer wrote at testNow (15:30 in India) and the reply went a minute later. */
const firstAt = new Date(liteTurnAt.getTime() + 4 * hour);
const secondAt = after(20 * hour);
const followUp1 = "Hope your day is going well, Rahul. Which trip would you like to go on?";
const followUp2 = "No rush at all, you can message us here any time.";

describe("the lite agent's follow-ups", () => {
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

  const state = (on: Agency) => on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
  const tokens = async (on: Agency) => (await outbound(on)).map((one) => one.clientToken);
  /** A follow-up's client token: the silence's last customer line, and `:2` for the second. */
  const nudgeToken = (on: Agency, lastInboundAt = testNow, second = false) =>
    `ai:nudge:${on.chat.id}:${String(lastInboundAt.getTime())}${second ? ":2" : ""}`;
  const lastRequest = (on: Agency) => JSON.stringify(on.model.requests.at(-1)?.messages ?? []);

  /** "Hi" gets the packages and asks which trip: the first follow-up is planned. */
  async function replied(on: Agency) {
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("replied");
  }
  async function firstWent(on: Agency) {
    await replied(on);
    on.model.answer(written(followUp1));
    expect(await on.nudges(firstAt)).toBe(1);
    expect(await tokens(on)).toContain(nudgeToken(on));
  }
  const staffWrites = (on: Agency, occurredAt: Date) =>
    on.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: on.chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Hi Rahul, calling you in a bit.",
          status: "sent",
          occurredAt,
        },
      }),
    );
  /** Runs `meanwhile` as the model is asked for the follow-up's words: after the turn's checks, before it acts. */
  function whileWriting(on: Agency, meanwhile: () => Promise<unknown>) {
    const complete = on.model.complete.bind(on.model);
    on.model.complete = async (request) => {
      if (request.schema?.name === "write_move") await meanwhile();
      return complete(request);
    };
  }

  it("a reply plans the first follow-up", async () => {
    const on = await liteAgency(test);
    await replied(on);
    expect(await state(on)).toMatchObject({ followUpAt: firstAt, followUpsSent: 0, followUpReason: null });
  });

  it("the first goes and plans the second", async () => {
    const on = await liteAgency(test);
    await replied(on);
    on.model.answer(written(followUp1));
    // Not due yet.
    expect(await on.nudges(new Date(firstAt.getTime() - 60_000))).toBe(0);
    const traces: LiteTrace[] = [];
    expect(await on.nudges(firstAt, { record: (trace) => Promise.resolve(void traces.push(trace)) })).toBe(1);
    const sent = await outbound(on);
    expect(sent.map((one) => one.clientToken)).toEqual([`ai:${on.message.id}`, nudgeToken(on)]);
    expect(sent[1]?.body).toBe(followUp1);
    expect(await state(on)).toMatchObject({ followUpsSent: 1, followUpAt: secondAt, lastNudgeAt: firstAt });
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ kind: "nudge", move: "follow_up", why: "follow_up:1", outcome: "replied" });
    expect(traces[0]?.understand).toBeNull();
    expect(traces[0]?.lookups).toEqual([]);
    expect(traces[0]?.sent.text).toBe(followUp1);
    // Only the Write call: no Understand, and the move asks for the trip again.
    expect(on.model.requests.map((request) => request.schema?.name)).toEqual([
      "understand_form",
      "write_move",
      "write_move",
    ]);
    expect(lastRequest(on)).toContain(
      "Pick the chat up again in one short, friendly line, then ask for which trip or place they would like.",
    );
  });

  it("the second goes, and no third", async () => {
    const on = await liteAgency(test);
    await firstWent(on);
    on.model.answer(written(followUp2));
    expect(await on.nudges(secondAt)).toBe(1);
    expect((await tokens(on)).slice(1)).toEqual([nudgeToken(on), nudgeToken(on, testNow, true)]);
    expect(await state(on)).toMatchObject({ followUpsSent: 2, followUpAt: null, lastNudgeAt: secondAt });
    expect(lastRequest(on)).toContain(
      "Write one short, friendly last line: they can message here any time. Ask nothing.",
    );
    const asked = on.model.requests.length;
    expect(await on.nudges(after(22 * hour))).toBe(0);
    expect(await tokens(on)).toHaveLength(3);
    expect(on.model.requests).toHaveLength(asked);
  });

  it.each([
    ["Ok thanks", understood([["ok_thanks", "Ok thanks"]])],
    ["Not interested anymore", understood([["not_interested", "Not interested"]])],
    ["Maybe later, I will let you know", understood([["later", "Maybe later"]])],
  ])("%s after the first stops the second", async (text, form) => {
    const on = await liteAgency(test);
    await firstWent(on);
    // Nothing of ours waits for an answer (F2): a bare ok ends it.
    if (text === "Ok thanks") await withFacts(on, { lastMove: "fixed", asked: [] });
    const token = await says(on, text, 5 * 3600);
    on.model.answer(form);
    await on.turn(after(5 * hour + 60_000), { token });
    expect(await state(on)).toMatchObject({ followUpAt: null, followUpsStopped: true });
    const sent = await tokens(on);
    expect(await on.nudges(secondAt)).toBe(0);
    expect(await tokens(on)).toEqual(sent);
    expect(sent.some((one) => one?.endsWith(":2"))).toBe(false);
  });

  it("the customer's next message starts the count again", async () => {
    const on = await liteAgency(test);
    await firstWent(on);
    // 20:30 in India: four hours on is past 9 pm, so the new first waits for 9 am.
    const token = await says(on, "Hi again", 5 * 3600);
    const wroteAt = after(5 * hour);
    on.model.answer(
      understood([["hello", "Hi again"]]),
      written("Hello again, good to hear from you. Which trip would you like?"),
    );
    expect(await on.turn(after(5 * hour + 60_000), { token })).toBe("replied");
    const firstAgain = after(17.5 * hour);
    expect(await state(on)).toMatchObject({ followUpsSent: 0, followUpAt: firstAgain });
    on.model.answer(written("Hope the planning is going well. Which place would you like to see?"));
    expect(await on.nudges(firstAgain)).toBe(1);
    expect((await tokens(on)).at(-1)).toBe(nudgeToken(on, wroteAt));
    expect(await state(on)).toMatchObject({ followUpsSent: 1 });
  });

  it("a follow-up due while the agent is paused is let go", async () => {
    const on = await liteAgency(test);
    await replied(on);
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
        aiAgentPausedAt: new Date(),
        aiAgentPausedBy: randomUUID(),
      },
    });
    on.model.answer(written(followUp1));
    expect(await on.nudges(firstAt)).toBe(0);
    expect(await state(on)).toMatchObject({ followUpAt: null, followUpsSent: 0 });
    await platform.subscription.update({
      where: { organizationId: on.organizationId },
      data: { aiAgentPausedAt: null, aiAgentPausedBy: null },
    });
    expect(await on.nudges(new Date(firstAt.getTime() + 60_000))).toBe(0);
    expect(await tokens(on)).toEqual([`ai:${on.message.id}`]);
  });

  it("a person's reply since ours lets the follow-up go, read before the model and again under the chat's lock", async () => {
    const on = await liteAgency(test);
    await replied(on);
    // An hour after our reply, long before the follow-up: no "person answering" wait is left by then.
    await staffWrites(on, after(hour));
    expect(await on.nudges(firstAt)).toBe(1);
    expect(on.model.requests).toHaveLength(2);
    expect(await tokens(on)).toEqual([`ai:${on.message.id}`, null]);

    const late = await liteAgency(test);
    await replied(late);
    late.model.answer(written(followUp1));
    whileWriting(late, () => staffWrites(late, after(hour)));
    expect(await late.nudges(firstAt)).toBe(1);
    expect(await tokens(late)).toEqual([`ai:${late.message.id}`, null]);
    expect(await state(late)).toMatchObject({ followUpsSent: 0, lastNudgeAt: null, handedOffAt: null });
  });

  it("a take-over while the follow-up is written lets it go", async () => {
    const on = await liteAgency(test);
    await replied(on);
    on.model.answer(written(followUp1));
    whileWriting(on, () =>
      on.inOrg((tx) => tx.aiChat.updateMany({ where: { conversationId: on.chat.id }, data: { mode: "off" } })),
    );
    expect(await on.nudges(firstAt)).toBe(1);
    expect(await tokens(on)).toEqual([`ai:${on.message.id}`]);
    expect(await state(on)).toMatchObject({ followUpsSent: 0, lastNudgeAt: null, attentionAt: null });
  });

  it("a follow-up whose words are refused sends nothing and tells nobody", async () => {
    const on = await liteAgency(test);
    await replied(on);
    // Two questions, twice.
    on.model.answer(written("Still there? Which trip?"), written("Hello? Which trip?"));
    expect(await on.nudges(firstAt)).toBe(1);
    expect(await tokens(on)).toEqual([`ai:${on.message.id}`]);
    expect(await state(on)).toMatchObject({
      followUpsSent: 0,
      followUpAt: null,
      handedOffAt: null,
      attentionAt: null,
    });
  });

  it.each(["lost", "won", "not_a_lead"] as const)(
    "staff close the lead (%s) after the reply: a person decided, so the follow-up is let go and no lead opened",
    async (stage) => {
      const on = await liteAgency(test);
      await replied(on);
      const leads = () => on.inOrg((tx) => tx.lead.findMany({ select: { id: true, stage: true } }));
      await on.inOrg((tx) => tx.lead.updateMany({ data: { stage } }));
      const before = await leads();
      on.model.answer(written(followUp1));
      expect(await on.nudges(firstAt)).toBe(1);
      expect(await tokens(on)).toEqual([`ai:${on.message.id}`]);
      expect(await state(on)).toMatchObject({ followUpAt: null, followUpsSent: 0, lastNudgeAt: null });
      // Let go before the model is asked.
      expect(on.model.requests).toHaveLength(2);
      expect(await leads()).toEqual(before);
    },
  );

  it("a lead closed while the follow-up is written lets it go", async () => {
    const on = await liteAgency(test);
    await replied(on);
    on.model.answer(written(followUp1));
    whileWriting(on, () => on.inOrg((tx) => tx.lead.updateMany({ data: { stage: "lost" } })));
    expect(await on.nudges(firstAt)).toBe(1);
    expect(await tokens(on)).toEqual([`ai:${on.message.id}`]);
    expect(await state(on)).toMatchObject({ followUpAt: null, followUpsSent: 0, lastNudgeAt: null });
  });

  it("a second planned for the margin's edge still goes when the minute job reaches it late", async () => {
    const on = await liteAgency(test);
    await firstWent(on);
    // A customer who wrote at 10:00 has the second at 09:00 the next day, exactly 23 hours on.
    const edge = after(23 * hour);
    await on.inOrg((tx) => tx.aiChat.updateMany({ where: { conversationId: on.chat.id }, data: { followUpAt: edge } }));
    on.model.answer(written(followUp2));
    expect(await on.nudges(new Date(edge.getTime() + 40_000))).toBe(1);
    expect((await tokens(on)).at(-1)).toBe(nudgeToken(on, testNow, true));
  });

  it("a lead follow-up task of a lite agency is left for the team", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.task.create({
        data: {
          kind: "follow-up",
          title: "Call about Kedarnath",
          dueAt: after(hour),
          firstDueAt: after(hour),
          recordType: "lead",
          recordId: on.leadId,
        },
      }),
    );
    expect(await on.nudges(after(2 * hour))).toBe(0);
    expect(await on.inOrg((tx) => tx.aiFollowUpTouch.count())).toBe(0);
    expect(await tokens(on)).toEqual([]);
  });

  it("the first agent's one nudge per silence is unchanged", async () => {
    const on = await liteAgency(test, { lite: false });
    const due = async () => {
      await on.inOrg(async (tx) => {
        await tx.whatsappConversation.updateMany({ data: { needsReply: false } });
        await tx.aiChat.upsert({
          where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
          create: { conversationId: on.chat.id, followUpAt: after(hour) },
          update: { followUpAt: after(hour) },
        });
      });
    };
    await due();
    on.model.answer(
      JSON.stringify({
        reply: "Hope you are well, Rahul. Shall I share the Kedarnath dates?",
        handoff: false,
        handoffReason: "",
        attention: "",
        memory: "",
        followUp: { needed: true, inHours: 4, why: "Check in" },
      }),
    );
    expect(await on.nudges(after(2 * hour))).toBe(1);
    expect(await tokens(on)).toEqual([nudgeToken(on)]);
    expect(await state(on)).toMatchObject({ followUpAt: null, followUpsSent: 0 });
    await due();
    expect(await on.nudges(after(3 * hour))).toBe(0);
    expect(await tokens(on)).toEqual([nudgeToken(on)]);
  });
});
