// Templates (spec 3.3, 3.4, 4.4 S7): picked up from the provider, written here and sent for approval, edited when rejected,
// archived; sent only when approved with its values, outside the window or to start a chat, never to someone who wrote STOP, with
// the "they agreed" tick for a chat we start, and within the day's and the month's caps and WhatsApp's own limit.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TemplateDraftInput } from "@travel-crm/contracts/inbox";
import {
  archiveTemplate,
  createTemplate,
  editTemplate,
  isOptOutText,
  listTemplates,
  queueTemplate,
  retryMessage,
  sendQueued,
  startChatForLead,
  syncTemplates,
  whatsappConsentOf,
  type ReplyContext,
} from "../../src/inbox/index.js";
import { newUuidV7 } from "../../src/kernel/index.js";
import { listenerContext, memberOf } from "../imports/support/test-imports.js";
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
const context: ReplyContext = { whatsappConfigured: true };
const draft: TemplateDraftInput = {
  name: "booking_update",
  language: "en",
  category: "utility",
  body: "Hello {{1}}, your trip to {{2}} is confirmed.",
  footer: null,
  variables: ["customer_name", "destination"],
  samples: ["Priya", "Goa"],
};

describe("message templates", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const deps = () => ({
    db: test.db,
    provider: test.provider,
    firstOwner: test.dependencies.identity.firstOwner,
  });

  async function agency() {
    const connection = await aConnectedAgency(test);
    return { connection, member: memberOf(connection.organizationId) };
  }

  /** A chat a customer opened at testNow; returns its id. */
  async function chatOf(connection: Awaited<ReturnType<typeof agency>>["connection"], text = "Hi") {
    const phone = freshPhone();
    await deliver(test, fromCustomer(connection, { customerNumber: phone.replace("+", ""), text }));
    const chat = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow({ where: { phoneE164: phone } }),
    );
    return { phone, chat };
  }

  async function approved(
    connection: { organizationId: string; integratedNumber: string },
    member: ReturnType<typeof memberOf>,
    category: "utility" | "marketing" = "utility",
    name = "booking_update",
  ) {
    await createTemplate(deps(), member, { ...draft, name, category }, testNow);
    test.provider.setTemplateStatus(connection.integratedNumber, name, "approved");
    await syncTemplates(deps(), connection.organizationId, testNow);
    return test.db.forOrg(connection.organizationId, (tx) => tx.whatsappTemplate.findFirstOrThrow({ where: { name } }));
  }

  const send = (
    connection: { organizationId: string },
    member: ReturnType<typeof memberOf>,
    input: {
      conversationId: string;
      templateId: string;
      parameters?: string[];
      agreed?: boolean;
      clientToken?: string;
    },
    at = new Date(testNow.getTime() + 30 * HOUR),
  ) =>
    test.db.forOrg(connection.organizationId, (tx) =>
      queueTemplate(
        tx,
        member,
        { parameters: ["Priya", "Goa"], agreed: false, clientToken: randomUUID(), ...input },
        context,
        at,
      ),
    );

  it("picks up what the provider lists, keeps an archived one archived, and ignores authentication", async () => {
    const { connection, member } = await agency();
    test.provider.addTemplate(connection.integratedNumber, {
      name: "diwali_offer",
      language: "en",
      category: "marketing",
      body: "Diwali offer for {{1}}",
      footer: null,
      status: "approved",
      reason: null,
      providerRef: "t1",
    });
    test.provider.addTemplate(connection.integratedNumber, {
      name: "login_code",
      language: "en",
      category: "authentication",
      body: "Code {{1}}",
      footer: null,
      status: "approved",
      reason: null,
      providerRef: "t2",
    });
    expect(await syncTemplates(deps(), connection.organizationId, testNow)).toEqual({ templates: 1 });
    const list = await test.db.forOrg(connection.organizationId, (tx) =>
      listTemplates(tx, { onlyApproved: false, now: testNow }),
    );
    expect(list.items.map((item) => [item.name, item.status, item.category, item.madeHere])).toEqual([
      ["diwali_offer", "approved", "marketing", false],
    ]);
    await test.db.forOrg(connection.organizationId, (tx) => archiveTemplate(tx, member, list.items[0]?.id ?? ""));
    test.provider.setTemplateStatus(connection.integratedNumber, "diwali_offer", "paused");
    await syncTemplates(deps(), connection.organizationId, testNow);
    const after = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappTemplate.findFirstOrThrow());
    expect(after.status).toBe("archived");
  });

  it("sends a new template for approval, refuses a name used twice, and sends a rejected one again", async () => {
    const { connection, member } = await agency();
    await createTemplate(deps(), member, draft, testNow);
    await expect(createTemplate(deps(), member, draft, testNow)).rejects.toMatchObject({ reason: "TEMPLATE_EXISTS" });
    await expect(editTemplate(deps(), member, randomUUID(), draft, testNow)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const row = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappTemplate.findFirstOrThrow());
    expect(row).toMatchObject({ status: "pending", createdBy: member.userId });
    await expect(editTemplate(deps(), member, row.id, draft, testNow)).rejects.toMatchObject({
      reason: "TEMPLATE_NOT_EDITABLE",
    });
    test.provider.setTemplateStatus(connection.integratedNumber, draft.name, "rejected", "Too promotional");
    await syncTemplates(deps(), connection.organizationId, testNow);
    const rejected = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappTemplate.findFirstOrThrow());
    expect(rejected).toMatchObject({ status: "rejected", reason: "Too promotional" });
    await editTemplate(deps(), member, row.id, { ...draft, body: "Hi {{1}}, {{2}} is confirmed." }, testNow);
    expect(
      await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappTemplate.findFirstOrThrow()),
    ).toMatchObject({
      status: "pending",
      reason: null,
      body: "Hi {{1}}, {{2}} is confirmed.",
    });
  });

  it("sends an approved template after the window closed, with its values, and counts it", async () => {
    const { connection, member } = await agency();
    const template = await approved(connection, member);
    const { phone, chat } = await chatOf(connection);
    const at = new Date(testNow.getTime() + 30 * HOUR);
    const queued = await send(connection, member, { conversationId: chat.id, templateId: template.id }, at);
    expect(queued.status).toBe("queued");
    const outcome = await sendQueued(
      {
        provider: test.provider,
        files: test.files,
        limiter: test.dependencies.limiter,
        logger: test.logger,
        managers: test.dependencies.managers,
      },
      listenerContext(test, connection.organizationId),
      { id: newUuidV7(), messageId: queued.messageId },
      at,
    );
    const stored = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.findUniqueOrThrow({ where: { id: queued.messageId } }),
    );
    expect([outcome, stored.failureCode]).toEqual(["sent", null]);
    const sent = test.provider.sent.find(
      (message) => message.to === phone.replace("+", "") && message.template !== undefined,
    );
    expect(sent?.template).toEqual({ name: "booking_update", language: "en", parameters: ["Priya", "Goa"] });
    const row = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.findUniqueOrThrow({ where: { id: queued.messageId } }),
    );
    expect(row).toMatchObject({
      kind: "template",
      body: "Hello Priya, your trip to Goa is confirmed.",
      status: "sent",
    });
    const usage = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappUsageMonth.findFirstOrThrow());
    expect(usage).toMatchObject({ utility: 1, replies: 0 });
  });

  it("refuses a template that is not approved, or whose values do not fit", async () => {
    const { connection, member } = await agency();
    await createTemplate(deps(), member, draft, testNow);
    const pending = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappTemplate.findFirstOrThrow());
    const { chat } = await chatOf(connection);
    await expect(send(connection, member, { conversationId: chat.id, templateId: pending.id })).rejects.toMatchObject({
      reason: "TEMPLATE_NOT_APPROVED",
    });
    const template = await approved(connection, member, "utility", "other_update");
    await expect(
      send(connection, member, { conversationId: chat.id, templateId: template.id, parameters: ["Priya"] }),
    ).rejects.toMatchObject({ reason: "TEMPLATE_VALUES" });
  });

  it("never sends to someone who wrote STOP, until they write again and staff tick", async () => {
    const { connection, member } = await agency();
    const template = await approved(connection, member);
    const { phone, chat } = await chatOf(connection, "Hi");
    expect(isOptOutText("  Stop  Messages ")).toBe(true);
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: phone.replace("+", ""),
        text: "STOP",
        ts: Math.floor(testNow.getTime() / 1000) + 60,
      }),
      new Date(testNow.getTime() + 60_000),
    );
    const person =
      (
        await test.db.forOrg(connection.organizationId, (tx) =>
          tx.whatsappConversation.findUniqueOrThrow({ where: { id: chat.id } }),
        )
      ).personId ?? "";
    expect((await test.db.forOrg(connection.organizationId, (tx) => whatsappConsentOf(tx, person))).state).toBe(
      "withdrawn",
    );
    const at = new Date(testNow.getTime() + 30 * HOUR);
    await expect(
      send(connection, member, { conversationId: chat.id, templateId: template.id, agreed: true }, at),
    ).rejects.toMatchObject({ reason: "NO_CONSENT_FOR_TEMPLATE" });
    // They write again: with the tick, the template may go, and the ledger says restored.
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: phone.replace("+", ""),
        text: "Sorry, yes please",
        ts: Math.floor(testNow.getTime() / 1000) + 3600 * 29,
      }),
      new Date(testNow.getTime() + 29 * HOUR),
    );
    await expect(
      send(connection, member, { conversationId: chat.id, templateId: template.id }, at),
    ).rejects.toMatchObject({ reason: "NO_CONSENT_FOR_TEMPLATE" });
    await send(connection, member, { conversationId: chat.id, templateId: template.id, agreed: true }, at);
    const audit = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId: person } }),
    );
    expect(audit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["whatsapp.opted-out", "whatsapp.consent-restored"]),
    );
  });

  it("starts a chat with a lead's person only with the tick, once, and records who agreed", async () => {
    const { connection, member } = await agency();
    const template = await approved(connection, member);
    const phone = freshPhone();
    const lead = await test.db.forOrg(connection.organizationId, async (tx) => {
      const { aLead, aPerson } = await import("../crm/support/records.js");
      const person = await aPerson(tx, { phoneE164: phone });
      return aLead(tx, { personId: person.id });
    });
    const { conversationId } = await test.db.forOrg(connection.organizationId, (tx) =>
      startChatForLead(tx, member, lead.id),
    );
    expect(
      (await test.db.forOrg(connection.organizationId, (tx) => startChatForLead(tx, member, lead.id))).conversationId,
    ).toBe(conversationId);
    await expect(send(connection, member, { conversationId, templateId: template.id })).rejects.toMatchObject({
      reason: "CONSENT_TICK_NEEDED",
    });
    const token = randomUUID();
    const first = await send(connection, member, {
      conversationId,
      templateId: template.id,
      agreed: true,
      clientToken: token,
    });
    expect(
      (await send(connection, member, { conversationId, templateId: template.id, agreed: true, clientToken: token }))
        .messageId,
    ).toBe(first.messageId);
    await send(connection, member, { conversationId, templateId: template.id });
    const audit = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { action: { in: ["whatsapp.consent-granted", "whatsapp.chat-started"] } } }),
    );
    expect(audit.map((entry) => entry.action).sort()).toEqual(["whatsapp.chat-started", "whatsapp.consent-granted"]);
  });

  it("counts a template when MSG91 takes it, so a send that fails does not use up the month's marketing cap", async () => {
    const { connection, member } = await agency();
    const marketing = await approved(connection, member, "marketing", "offer_update");
    const { chat } = await chatOf(connection);
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConnection.updateMany({ data: { marketingCapMonth: 1 } }),
    );
    const at = new Date(testNow.getTime() + 30 * HOUR);
    const run = (messageId: string) =>
      sendQueued(
        {
          provider: test.provider,
          files: test.files,
          limiter: test.dependencies.limiter,
          logger: test.logger,
          managers: test.dependencies.managers,
        },
        listenerContext(test, connection.organizationId),
        { id: newUuidV7(), messageId },
        at,
      );
    const first = await send(connection, member, { conversationId: chat.id, templateId: marketing.id }, at);
    // Still on its way, it holds the one place there is.
    await expect(
      send(connection, member, { conversationId: chat.id, templateId: marketing.id }, at),
    ).rejects.toMatchObject({ reason: "MARKETING_CAP_REACHED" });
    test.provider.failNext("not_on_whatsapp");
    expect(await run(first.messageId)).toBe("failed");
    const usage = () => test.db.forOrg(connection.organizationId, (tx) => tx.whatsappUsageMonth.findFirst());
    expect((await usage())?.marketing ?? 0).toBe(0);
    const second = await send(connection, member, { conversationId: chat.id, templateId: marketing.id }, at);
    expect(await run(second.messageId)).toBe("sent");
    expect((await usage())?.marketing).toBe(1);
    await expect(
      send(connection, member, { conversationId: chat.id, templateId: marketing.id }, at),
    ).rejects.toMatchObject({ reason: "MARKETING_CAP_REACHED" });
  });

  it("tells the author and the Owner once when a template is rejected, and the lead assigners when WhatsApp's limit is reached", async () => {
    const { connection, member } = await agency();
    await createTemplate(deps(), member, draft, testNow);
    test.provider.setTemplateStatus(connection.integratedNumber, draft.name, "rejected", "No");
    await syncTemplates(deps(), connection.organizationId, testNow);
    await syncTemplates(deps(), connection.organizationId, testNow);
    const owner = await test.dependencies.identity.firstOwner(connection.organizationId);
    const told = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.notification.findMany({ where: { kind: "whatsapp.needs-attention" } }),
    );
    expect(told.map((row) => row.recipientUserId).sort()).toEqual([member.userId, owner].sort());
    expect(told[0]?.title).toBe(`The WhatsApp template ${draft.name} was rejected`);

    const template = await approved(connection, member, "utility", "limit_update");
    const { chat } = await chatOf(connection);
    const at = new Date(testNow.getTime() + 30 * HOUR);
    const queued = await send(connection, member, { conversationId: chat.id, templateId: template.id }, at);
    test.provider.failNext("tier_limit");
    await sendQueued(
      {
        provider: test.provider,
        files: test.files,
        limiter: test.dependencies.limiter,
        logger: test.logger,
        managers: test.dependencies.managers,
      },
      listenerContext(test, connection.organizationId),
      { id: newUuidV7(), messageId: queued.messageId },
      at,
    );
    const limit = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.notification.findMany({ where: { kind: "whatsapp.needs-attention", title: { contains: "daily limit" } } }),
    );
    expect(limit).toHaveLength(1);
  });

  it("checks a template again on Try again: a STOP since, the month's cap, a template turned down since", async () => {
    const { connection, member } = await agency();
    const template = await approved(connection, member, "marketing", "offer_update");
    const { phone, chat } = await chatOf(connection);
    const at = new Date(testNow.getTime() + 30 * HOUR);
    const failed = async () => {
      const queued = await send(connection, member, { conversationId: chat.id, templateId: template.id }, at);
      await test.db.forOrg(connection.organizationId, (tx) =>
        tx.whatsappMessage.update({
          where: { id: queued.messageId },
          data: { status: "failed", failureCode: "other" },
        }),
      );
      return queued.messageId;
    };
    const retry = (id: string) =>
      test.db.forOrg(connection.organizationId, (tx) => retryMessage(tx, member, id, context, at));
    // The cap is used up by another send that went; the failed one cannot slip past it.
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConnection.updateMany({ data: { marketingCapMonth: 1 } }),
    );
    const first = await failed();
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappUsageMonth.updateMany({ data: { marketing: 1 } }),
    );
    await expect(retry(first)).rejects.toMatchObject({ reason: "MARKETING_CAP_REACHED" });
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConnection.updateMany({ data: { marketingCapMonth: 300 } }),
    );
    // The template was paused at Meta since.
    test.provider.setTemplateStatus(connection.integratedNumber, "offer_update", "paused");
    await syncTemplates(deps(), connection.organizationId, testNow);
    await expect(retry(first)).rejects.toMatchObject({ reason: "TEMPLATE_NOT_APPROVED" });
    test.provider.setTemplateStatus(connection.integratedNumber, "offer_update", "approved");
    await syncTemplates(deps(), connection.organizationId, testNow);
    // The customer wrote STOP after the failure.
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: phone.replace("+", ""),
        text: "STOP",
        ts: Math.floor(testNow.getTime() / 1000) + 60,
      }),
      new Date(testNow.getTime() + 60_000),
    );
    await expect(retry(first)).rejects.toMatchObject({ reason: "NO_CONSENT_FOR_TEMPLATE" });
  });

  it("lets two sends at once take only the one place left under the month's cap", async () => {
    const { connection, member } = await agency();
    const template = await approved(connection, member, "marketing", "offer_update");
    const one = await chatOf(connection);
    const two = await chatOf(connection);
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConnection.updateMany({ data: { marketingCapMonth: 1 } }),
    );
    const at = new Date(testNow.getTime() + 30 * HOUR);
    const results = await Promise.allSettled([
      send(connection, member, { conversationId: one.chat.id, templateId: template.id }, at),
      send(connection, member, { conversationId: two.chat.id, templateId: template.id }, at),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(refused?.reason).toMatchObject({ reason: "MARKETING_CAP_REACHED" });
    const queued = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.count({ where: { kind: "template" } }),
    );
    expect(queued).toBe(1);
  });

  it("holds the day's cap, the month's marketing cap and WhatsApp's own limit", async () => {
    const { connection, member } = await agency();
    const utility = await approved(connection, member);
    const marketing = await approved(connection, member, "marketing", "offer_update");
    const { chat } = await chatOf(connection);
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConnection.updateMany({ data: { marketingCapMonth: 1, templateCapDay: 3 } }),
    );
    await send(connection, member, { conversationId: chat.id, templateId: marketing.id });
    await expect(send(connection, member, { conversationId: chat.id, templateId: marketing.id })).rejects.toMatchObject(
      { reason: "MARKETING_CAP_REACHED" },
    );
    await send(connection, member, { conversationId: chat.id, templateId: utility.id });
    await send(connection, member, { conversationId: chat.id, templateId: utility.id });
    await expect(send(connection, member, { conversationId: chat.id, templateId: utility.id })).rejects.toMatchObject({
      reason: "TEMPLATE_CAP_REACHED",
    });
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConnection.updateMany({ data: { templateCapDay: 100 } }),
    );
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.updateMany({
        where: { kind: "template" },
        data: { status: "failed", failureCode: "tier_limit" },
      }),
    );
    await expect(send(connection, member, { conversationId: chat.id, templateId: utility.id })).rejects.toMatchObject({
      reason: "TIER_LIMIT_REACHED",
    });
  });
});
