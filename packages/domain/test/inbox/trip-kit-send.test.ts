// Sending a trip's details (sales inbox, trip details): by a member's tap, and by themselves when a customer's message holds a
// keyword. Neither writes to someone who asked to stop or withdrew, or outside the 24-hour window; a listener run twice sends
// once; and the automatic send is once per chat per trip, whichever message held the keyword.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { automationCouldAct, sendTripKit, sendTripKitOnKeyword } from "../../src/inbox/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

const HOUR = 3_600_000;

describe("sending a trip's details", () => {
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

  async function agency() {
    const connection = await aConnectedAgency(test);
    const customerNumber = freshPhone().replace("+", "");
    const actor = systemActor(connection.organizationId);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(connection.organizationId, work);
    const kit = (name: string, keywords: string[], autoSend = true) =>
      inOrg((tx) =>
        tx.tripKit.create({
          data: { name, message: `${name}: itinerary and price`, keywords, autoSend },
          select: { id: true },
        }),
      );
    const customerSays = async (text: string, minutes = 0) => {
      const at = new Date(testNow.getTime() + minutes * 60_000);
      await deliver(test, fromCustomer(connection, { customerNumber, text, ts: Math.floor(at.getTime() / 1000) }), at);
      const message = await inOrg((tx) =>
        tx.whatsappMessage.findFirstOrThrow({
          where: { body: text, direction: "in" },
          orderBy: { occurredAt: "desc" },
        }),
      );
      return { messageId: message.id, conversationId: message.conversationId, at };
    };
    const keyword = (said: { messageId: string; conversationId: string; at: Date }) =>
      sendTripKitOnKeyword(test.dependencies, actor, said, said.at);
    const sentOut = () =>
      inOrg((tx) => tx.whatsappMessage.findMany({ where: { direction: "out" }, orderBy: { id: "asc" } }));
    const sends = () => inOrg((tx) => tx.tripKitSend.findMany());
    return { connection, inOrg, kit, customerSays, keyword, sentOut, sends };
  }

  it("sends the trip once when a keyword is said, and a second run of the listener sends nothing more", async () => {
    const { kit, customerSays, keyword, sentOut, sends } = await agency();
    await kit("Kerala", ["kerala"]);
    const said = await customerSays("Any Kerala packages?");
    expect(await keyword(said)).toBe(true);
    expect(await keyword(said)).toBe(false);
    expect((await sentOut()).map((message) => message.body)).toEqual(["Kerala: itinerary and price"]);
    expect(await sends()).toHaveLength(1);
  });

  /** The agent switched on in the agency's settings, with the AI module on or off. */
  const agentOn = (inOrg: <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => Promise<T>, module: boolean) =>
    inOrg(async (tx) => {
      await tx.salesAutomation.create({ data: { hotKeywords: [], followEnabled: false } });
      await tx.aiSettings.create({ data: { enabled: module } });
      await tx.aiAutopilot.create({ data: { autopilot: true } });
    });

  it("an agent that can answer sends the files itself: keyword kits don't send, and staff still send a kit from the chat", async () => {
    const { inOrg, kit, customerSays, keyword, sentOut, sends } = await agency();
    await kit("Kerala", ["kerala"]);
    await agentOn(inOrg, true);
    expect(await keyword(await customerSays("Any Kerala packages?"))).toBe(false);
    expect(await sentOut()).toHaveLength(0);
    expect(await sends()).toHaveLength(0);
    // The agent itself listens to every message.
    expect(await inOrg((tx) => automationCouldAct(tx))).toBe(true);
  });

  it("keyword kits send while the agent is on but the AI module is off", async () => {
    const { inOrg, kit, customerSays, keyword, sentOut } = await agency();
    await kit("Kerala", ["kerala"]);
    await agentOn(inOrg, false);
    expect(await keyword(await customerSays("Any Kerala packages?"))).toBe(true);
    expect(await sentOut()).toHaveLength(1);
  });

  it("keyword kits send while the agent is paused for the agency", async () => {
    const { connection, inOrg, kit, customerSays, keyword, sentOut } = await agency();
    await kit("Kerala", ["kerala"]);
    await agentOn(inOrg, true);
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
        organizationId: connection.organizationId,
        planId: plan.id,
        billingCycle: "monthly",
        status: "trial",
        statusChangedAt: testNow,
        trialEndsOn: new Date("2099-01-01"),
        aiAgentPausedAt: new Date(),
        aiAgentPausedBy: randomUUID(),
      },
    });
    expect(await keyword(await customerSays("Any Kerala packages?"))).toBe(true);
    expect(await sentOut()).toHaveLength(1);
  });

  it("sends a trip once a chat, whichever later message says its keyword, and each trip once", async () => {
    const { kit, customerSays, keyword, sentOut } = await agency();
    await kit("Kerala", ["kerala"]);
    await kit("Goa", ["goa"]);
    expect(await keyword(await customerSays("kerala please", 1))).toBe(true);
    expect(await keyword(await customerSays("and kerala in June?", 2))).toBe(false);
    expect(await keyword(await customerSays("what about goa", 3))).toBe(true);
    expect((await sentOut()).map((message) => message.body)).toEqual([
      "Kerala: itinerary and price",
      "Goa: itinerary and price",
    ]);
  });

  it("leaves a trip that is not set to send itself, and a word that is only part of another", async () => {
    const { kit, customerSays, keyword, sentOut } = await agency();
    await kit("Manali", ["manali"], false);
    await kit("Goa", ["goa"]);
    expect(await keyword(await customerSays("manali?"))).toBe(false);
    expect(await keyword(await customerSays("I love goan food", 1))).toBe(false);
    expect(await sentOut()).toHaveLength(0);
  });

  it("does not answer someone who asks to stop, nor anyone who has withdrawn", async () => {
    const { kit, customerSays, keyword, sentOut } = await agency();
    await kit("Kerala", ["kerala", "stop"]);
    expect(await keyword(await customerSays("STOP", 1))).toBe(false);
    // They have withdrawn: a later message with the keyword is not written back to.
    expect(await keyword(await customerSays("kerala", 2))).toBe(false);
    expect(await sentOut()).toHaveLength(0);
  });

  it("does not send outside the 24-hour window, and records nothing for it", async () => {
    const { kit, inOrg, customerSays, keyword, sentOut, sends } = await agency();
    await kit("Kerala", ["kerala"]);
    const said = await customerSays("kerala?");
    await inOrg((tx) =>
      tx.whatsappConversation.updateMany({ data: { lastInboundAt: new Date(testNow.getTime() - 25 * HOUR) } }),
    );
    expect(await keyword(said)).toBe(false);
    expect(await sentOut()).toHaveLength(0);
    expect(await sends()).toHaveLength(0);
  });

  describe("by a member's tap", () => {
    const context = { whatsappConfigured: true };

    it("sends it once for one token, and says why when the window has closed", async () => {
      const { connection, kit, customerSays, sentOut } = await agency();
      const trip = await kit("Kerala", ["kerala"]);
      const said = await customerSays("hello");
      const member = memberOf(connection.organizationId);
      const input = { conversationId: said.conversationId, tripKitId: trip.id, clientToken: randomUUID() };
      expect(await sendTripKit(test.dependencies, member, input, context, said.at)).toMatchObject({ queued: 1 });
      expect(await sendTripKit(test.dependencies, member, input, context, said.at)).toMatchObject({ queued: 1 });
      expect(await sentOut()).toHaveLength(1);
      await expect(
        sendTripKit(
          test.dependencies,
          member,
          { ...input, clientToken: randomUUID() },
          context,
          new Date(testNow.getTime() + 25 * HOUR),
        ),
      ).rejects.toMatchObject({ reason: "WINDOW_CLOSED" });
    });

    it("refuses a customer who withdrew, with nothing queued", async () => {
      const { connection, kit, customerSays, sentOut } = await agency();
      const trip = await kit("Kerala", ["kerala"]);
      const said = await customerSays("STOP");
      const member = memberOf(connection.organizationId);
      const result = await sendTripKit(
        test.dependencies,
        member,
        { conversationId: said.conversationId, tripKitId: trip.id, clientToken: randomUUID() },
        context,
        said.at,
      );
      expect(result).toMatchObject({ queued: 0, refused: "opted_out" });
      expect(await sentOut()).toHaveLength(0);
    });
  });
});
