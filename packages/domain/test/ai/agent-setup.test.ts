// The AI agent's setup checklist: each step's done rule, "ready" ignoring the optional step, turning the agent on only when
// ready (off always), the autopilot's other columns left alone, and the open hand-overs a member's inbox may show.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  agentSetupOf,
  autopilotOf,
  handedOverChatsOf,
  saveAgencyAnswers,
  saveAgentBasics,
  setAgentOn,
} from "../../src/ai/index.js";
import { addPaymentQr, removePaymentQrs } from "./support/payment-qr.js";
import { storeAutopilot } from "./support/store-autopilot.js";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { anAgency, memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, freshPhone, type TestInbox } from "../inbox/support.js";

const today = parseCalendarDate("2026-11-10");
const day = (text: string) => new Date(`${text}T00:00:00Z`);
const allAnswers = {
  cancellation: "a",
  refunds: "b",
  id_documents: "c",
  safety: "d",
  children: "e",
  payment_methods: "f",
};

describe("the AI agent's setup", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function agency({ connected = true } = {}) {
    const organizationId = connected
      ? (await aConnectedAgency(test)).organizationId
      : await anAgency(test, "Setup agency");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberOf(organizationId, "org-owner");
    const step = async (key: string) =>
      (await inOrg((tx) => agentSetupOf(tx, organizationId, today))).steps.find((one) => one.key === key);
    return { organizationId, inOrg, owner, step };
  }
  type World = Awaited<ReturnType<typeof agency>>;

  const paymentDetails = (on: World) => on.inOrg((tx) => addPaymentQr(tx, on.organizationId));

  async function aSellablePackage(on: World) {
    await paymentDetails(on);
    await on.inOrg(async (tx) => {
      const template = await tx.quoteTemplate.create({
        data: {
          name: `Spiti ${randomUUID()}`,
          title: "Spiti",
          kind: "group",
          roomTypes: ["double"],
          advancePerPersonPaise: 500_000n,
          aiSellable: true,
          nights: 6,
        },
        select: { id: true },
      });
      await tx.packageSeason.create({
        data: {
          templateId: template.id,
          label: "Nov",
          startsOn: day("2026-11-01"),
          endsOn: day("2026-11-30"),
          priceDoublePaise: 699_900n,
        },
      });
      await tx.departure.create({
        data: {
          title: "Batch",
          startDate: day("2026-11-14"),
          endDate: day("2026-11-20"),
          seatsTotal: 12,
          templateId: template.id,
        },
      });
    });
  }

  async function everythingDone(on: World) {
    await aSellablePackage(on);
    await on.inOrg((tx) => saveAgencyAnswers(tx, on.owner, { answers: allAnswers }));
    await on.inOrg((tx) => saveAgentBasics(tx, on.owner, { agentName: "Riya", tone: "friendly" }));
  }

  it("whatsapp is done once the agency's number is connected", async () => {
    expect((await (await agency({ connected: false })).step("whatsapp"))?.done).toBe(false);
    expect((await (await agency()).step("whatsapp"))?.done).toBe(true);
  });

  it("packages is done when one is sellable, counting them", async () => {
    const on = await agency();
    expect(await on.step("packages")).toMatchObject({ done: false, count: 0 });
    await aSellablePackage(on);
    expect(await on.step("packages")).toMatchObject({ done: true, count: 1 });
  });

  it("packages counts group packages only: a custom one the AI may quote does not make the agent ready", async () => {
    const on = await agency();
    await paymentDetails(on);
    await on.inOrg((tx) =>
      tx.quoteTemplate.create({
        data: {
          name: `Custom ${randomUUID()}`,
          title: "Custom",
          kind: "custom",
          aiSellable: true,
          fromPricePaise: 10_000_00n,
        },
      }),
    );
    expect(await on.step("packages")).toMatchObject({ done: false, count: 0, total: 0 });
  });

  it("packages says how many are held back only by the missing payment details", async () => {
    const on = await agency();
    await aSellablePackage(on);
    await on.inOrg((tx) => removePaymentQrs(tx, on.organizationId));
    expect(await on.step("packages")).toMatchObject({ done: false, count: 0, total: 1 });
    await paymentDetails(on);
    expect(await on.step("packages")).toMatchObject({ done: true, count: 1, total: 0 });
  });

  it("payment is done only with the payment QR: a UPI ID alone is not enough", async () => {
    const on = await agency();
    expect((await on.step("payment"))?.done).toBe(false);
    await on.inOrg((tx) =>
      tx.organizationProfile.upsert({
        where: { organizationId: on.organizationId },
        create: { legalName: "Sharma Holidays", gstStateCode: "27", upiId: "sharma@okbank" },
        update: { upiId: "sharma@okbank" },
      }),
    );
    expect((await on.step("payment"))?.done).toBe(false);
    await paymentDetails(on);
    expect((await on.step("payment"))?.done).toBe(true);
  });

  it("answers is done only when all six are answered", async () => {
    const on = await agency();
    await on.inOrg((tx) => saveAgencyAnswers(tx, on.owner, { answers: { cancellation: "a", refunds: "b" } }));
    expect(await on.step("answers")).toMatchObject({ done: false, count: 2, total: 6 });
    await on.inOrg((tx) => saveAgencyAnswers(tx, on.owner, { answers: allAnswers }));
    expect(await on.step("answers")).toMatchObject({ done: true, count: 6, total: 6 });
  });

  it("basics is done when the agent has a name", async () => {
    const on = await agency();
    expect((await on.step("basics"))?.done).toBe(false);
    await on.inOrg((tx) => saveAgentBasics(tx, on.owner, { agentName: "  ", tone: "friendly" }));
    expect((await on.step("basics"))?.done).toBe(false);
    await on.inOrg((tx) => saveAgentBasics(tx, on.owner, { agentName: "Riya", tone: "friendly" }));
    expect((await on.step("basics"))?.done).toBe(true);
  });

  it("ads is optional and done when every ad seen has a package, and ready ignores it", async () => {
    const on = await agency();
    await everythingDone(on);
    expect(await on.step("ads")).toMatchObject({ optional: true, done: true, count: 0, total: 0 });
    await on.inOrg((tx) =>
      tx.whatsappAd.create({
        data: { adKey: "ad-1", headline: "Spiti", firstSeenAt: day("2026-11-01"), lastSeenAt: day("2026-11-02") },
      }),
    );
    expect(await on.step("ads")).toMatchObject({ done: false, count: 0, total: 1 });
    const setup = await on.inOrg((tx) => agentSetupOf(tx, on.organizationId, today));
    expect(setup.ready).toBe(true);
    expect(setup.on).toBe(false);
    expect(setup.pausedBySupport).toBe(false);
  });

  it("refuses turning on while a step is missing, turns on when ready, and turning off is always allowed", async () => {
    const on = await agency();
    const reason = await on
      .inOrg((tx) => setAgentOn(tx, on.owner, true, today))
      .then(
        () => null,
        (error: unknown) => (error as { reason?: string }).reason ?? "other",
      );
    expect(reason).toBe("AGENT_SETUP_INCOMPLETE");
    expect((await on.inOrg((tx) => autopilotOf(tx))).autopilot).toBe(false);
    await expect(on.inOrg((tx) => setAgentOn(tx, on.owner, false, today))).resolves.toMatchObject({ on: false });
    await everythingDone(on);
    await expect(on.inOrg((tx) => setAgentOn(tx, on.owner, true, today))).resolves.toMatchObject({ on: true });
    await expect(on.inOrg((tx) => setAgentOn(tx, on.owner, false, today))).resolves.toMatchObject({ on: false });
    const actions = (await on.inOrg((tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }))).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["ai-agent.turned-on", "ai-agent.turned-off"]));
  });

  it("turning on is refused with only a UPI ID: the payment QR is missing", async () => {
    const on = await agency();
    await everythingDone(on);
    await on.inOrg((tx) => removePaymentQrs(tx, on.organizationId));
    await on.inOrg((tx) =>
      tx.organizationProfile.upsert({
        where: { organizationId: on.organizationId },
        create: { legalName: "Sharma Holidays", gstStateCode: "27", upiId: "sharma@okbank" },
        update: { upiId: "sharma@okbank" },
      }),
    );
    await expect(on.inOrg((tx) => setAgentOn(tx, on.owner, true, today))).rejects.toMatchObject({
      reason: "AGENT_SETUP_INCOMPLETE",
    });
  });

  it("turning on leaves every other autopilot column as it was", async () => {
    const on = await agency();
    await everythingDone(on);
    await on.inOrg((tx) =>
      storeAutopilot(tx, on.owner.organizationId, { strictRules: "No discounts.", maxRepliesPerDay: 7 }),
    );
    const before = await on.inOrg((tx) => autopilotOf(tx));
    await on.inOrg((tx) => setAgentOn(tx, on.owner, true, today));
    expect(await on.inOrg((tx) => autopilotOf(tx))).toEqual({ ...before, autopilot: true });
  });

  describe("hand-overs", () => {
    async function aChat(
      on: World,
      connectionId: string,
      handed: Date | null,
      extra: { personId?: string; state?: string; needsReply?: boolean } = {},
    ) {
      return on.inOrg(async (tx) => {
        const chat = await tx.whatsappConversation.create({
          data: { connectionId, phoneE164: freshPhone(), profileName: "Profile name", needsReply: true, ...extra },
          select: { id: true },
        });
        await tx.aiChat.create({
          data: {
            conversationId: chat.id,
            handedOffAt: handed,
            handoffReason: handed === null ? null : "Wants a discount",
          },
        });
        return chat.id;
      });
    }

    it("lists only open handed-over chats, newest first, named from the person or the profile", async () => {
      const on = await agency();
      const connectionId = await on.inOrg(async (tx) => (await tx.whatsappConnection.findFirstOrThrow()).id);
      const person = await on.inOrg((tx) => aPerson(tx, { name: "Rahul Sharma" }));
      const older = await aChat(on, connectionId, new Date("2026-11-01T10:00:00Z"), { personId: person.id });
      const newer = await aChat(on, connectionId, new Date("2026-11-02T10:00:00Z"));
      await aChat(on, connectionId, null);
      await aChat(on, connectionId, new Date("2026-11-03T10:00:00Z"), { state: "erased" });
      const list = await on.inOrg((tx) => handedOverChatsOf(tx, on.owner));
      expect(list.map((chat) => chat.conversationId)).toEqual([newer, older]);
      expect(list.map((chat) => chat.name)).toEqual(["Profile name", "Rahul Sharma"]);
      expect(list[0]).toMatchObject({ reason: "Wants a discount", since: "2026-11-02T10:00:00.000Z" });
    });

    it("leaves out a hand-over the team has since replied to", async () => {
      const on = await agency();
      const connectionId = await on.inOrg(async (tx) => (await tx.whatsappConnection.findFirstOrThrow()).id);
      const waiting = await aChat(on, connectionId, new Date("2026-11-01T10:00:00Z"));
      await aChat(on, connectionId, new Date("2026-11-02T10:00:00Z"), { needsReply: false });
      const list = await on.inOrg((tx) => handedOverChatsOf(tx, on.owner));
      expect(list.map((chat) => chat.conversationId)).toEqual([waiting]);
    });

    it("shows a member with their own scope only the chats of people whose leads they own", async () => {
      const on = await agency();
      const connectionId = await on.inOrg(async (tx) => (await tx.whatsappConnection.findFirstOrThrow()).id);
      const seller = memberOf(on.organizationId, "sales");
      const mine = await on.inOrg((tx) => aPerson(tx));
      const theirs = await on.inOrg((tx) => aPerson(tx));
      await on.inOrg((tx) => aLead(tx, { personId: mine.id, ownerUserId: seller.userId }));
      await on.inOrg((tx) => aLead(tx, { personId: theirs.id, ownerUserId: randomUUID() }));
      const ownChat = await aChat(on, connectionId, new Date("2026-11-01T10:00:00Z"), { personId: mine.id });
      await aChat(on, connectionId, new Date("2026-11-02T10:00:00Z"), { personId: theirs.id });
      expect((await on.inOrg((tx) => handedOverChatsOf(tx, seller))).map((chat) => chat.conversationId)).toEqual([
        ownChat,
      ]);
      expect(await on.inOrg((tx) => handedOverChatsOf(tx, on.owner))).toHaveLength(2);
    });
  });
});
