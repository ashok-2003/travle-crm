// Telling the customer a person's decision about their payment: the agency's own words inside the 24-hour window, its approved
// template outside it, else one task for the lead's owner; a repeat of the same decision changes nothing. {date} is the
// agency's day of the decision; a blank the record can't fill keeps the words from going; the preview is what then goes.
import { saveBookingSettingsInput } from "@travel-crm/contracts/bookings";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bookingSettingsOf, saveBookingSettings } from "../../src/bookings/settings.js";
import { previewPaymentTelling, tellPaymentOutcome, type PaymentTelling } from "../../src/bookings/payment-messages.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { openWorld, type World } from "./support.js";

const now = new Date("2026-10-30T06:30:00Z");
const HOUR = 3_600_000;

describe("telling the customer about their payment", () => {
  let world: World;
  beforeEach(async () => {
    world = await openWorld("Payment messages");
  });
  afterEach(async () => {
    await world.close();
  });

  /** A lead whose chat last heard from the customer `hoursAgo` hours before now, with a live number. */
  async function aChat(hoursAgo: number, options: { template?: boolean; withdrawn?: boolean; name?: string } = {}) {
    return world.inOrg(async (tx) => {
      const connection = await tx.whatsappConnection.create({
        data: {
          integratedNumber: `91${String(Math.floor(Math.random() * 1e8))}`,
          displayNumber: "+919800000000",
          mode: "new_number",
          status: "connected",
          connectedAt: now,
        },
        select: { id: true },
      });
      const person = await aPerson(tx, { name: options.name ?? "Asha Rao" });
      const lead = await aLead(tx, { personId: person.id, ownerUserId: world.seller.userId });
      const phone = await tx.person.findUniqueOrThrow({ where: { id: person.id }, select: { phoneE164: true } });
      const chat = await tx.whatsappConversation.create({
        data: {
          connectionId: connection.id,
          phoneE164: phone.phoneE164 ?? "",
          personId: person.id,
          lastInboundAt: new Date(now.getTime() - hoursAgo * HOUR),
          lastMessageAt: now,
        },
        select: { id: true },
      });
      await tx.personConsent.create({
        data: {
          personId: person.id,
          purpose: "trip_updates",
          action: "granted",
          wording: "test",
          wordingVersion: 1,
          source: "staff",
          recordedAt: new Date(now.getTime() - 100 * HOUR),
        },
      });
      if (options.withdrawn === true) {
        await tx.personConsent.create({
          data: {
            personId: person.id,
            purpose: "whatsapp",
            action: "withdrawn",
            wording: "test",
            wordingVersion: 1,
            source: "customer",
            recordedAt: new Date(now.getTime() - 24 * HOUR),
          },
        });
      }
      if (options.template === true) {
        const template = await tx.whatsappTemplate.create({
          data: {
            connectionId: connection.id,
            name: "payment_confirmed",
            language: "en",
            category: "utility",
            body: "Hi {{1}}, we received {{2}}.",
            status: "approved",
          },
          select: { id: true },
        });
        const current = await bookingSettingsOf(tx);
        await saveBookingSettings(tx, world.manager, {
          ...current,
          paymentConfirmedTemplateId: template.id,
          paymentConfirmedParams: ["name", "amount"],
        });
      }
      return { leadId: lead.id, chatId: chat.id };
    });
  }

  const telling = (
    leadId: string | null,
    recordKey: string,
    outcome: "confirmed" | "not_found" = "confirmed",
    more: Partial<Pick<PaymentTelling, "conversationId" | "amountPaise" | "trip">> = {},
  ): PaymentTelling => ({
    organizationId: world.organizationId,
    leadId,
    conversationId: more.conversationId ?? null,
    outcome,
    amountPaise: more.amountPaise === undefined ? 1_250_000 : more.amountPaise,
    trip: more.trip === undefined ? "Manali 5N" : more.trip,
    recordKey,
  });
  const tell = (
    leadId: string | null,
    recordKey: string,
    outcome: "confirmed" | "not_found" = "confirmed",
    more: Partial<Pick<PaymentTelling, "conversationId" | "amountPaise" | "trip">> & { at?: Date } = {},
  ) => world.inOrg((tx) => tellPaymentOutcome(tx, telling(leadId, recordKey, outcome, more), more.at ?? now));

  const outgoing = (chatId: string) =>
    world.inOrg((tx) => tx.whatsappMessage.findMany({ where: { conversationId: chatId, direction: "out" } }));
  const tasksOf = (leadId: string) =>
    world.inOrg((tx) => tx.task.findMany({ where: { recordType: "lead", recordId: leadId } }));

  it("inside the window the agency's words go, with its blanks filled", async () => {
    const { leadId, chatId } = await aChat(1);
    expect(await tell(leadId, "proof-1")).toBe("sent");
    const messages = await outgoing(chatId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toBe(
      "Thank you Asha! We have received ₹12,500.00 for Manali 5N on 30 Oct. Your booking is confirmed.",
    );
    expect(messages[0]?.origin).toBe("automation");
    expect(messages[0]?.sentBy).toBeNull();
    expect(await tasksOf(leadId)).toHaveLength(0);
  });

  it("inside the window the not-found words go", async () => {
    const { leadId, chatId } = await aChat(1);
    expect(await tell(leadId, "proof-6", "not_found")).toBe("sent");
    expect((await outgoing(chatId))[0]?.body).toBe(
      "Hi Asha, we could not find your payment of ₹12,500.00 yet. Could you send the transaction reference or a clearer screenshot?",
    );
  });

  it("the date is the agency's day the payment was decided: at 00:30 IST it is that day, not UTC's", async () => {
    const { leadId, chatId } = await aChat(1);
    await tell(leadId, "proof-7", "confirmed", { at: new Date("2026-10-30T19:00:00Z") });
    expect((await outgoing(chatId))[0]?.body).toContain("on 31 Oct.");
  });

  it("an amount nobody knows is never ₹0.00: with no template the owner gets a task", async () => {
    const { leadId, chatId } = await aChat(1);
    expect(await tell(leadId, "proof-11", "not_found", { amountPaise: null })).toBe("task");
    expect(await outgoing(chatId)).toHaveLength(0);
  });

  it("an amount nobody knows is never ₹0.00: the template goes instead of the words", async () => {
    const { leadId, chatId } = await aChat(1, { template: true });
    expect(await tell(leadId, "proof-12", "confirmed", { amountPaise: null })).toBe("template");
    const sent = await outgoing(chatId);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).not.toContain("₹0.00");
  });

  it("a trip no person priced stays a blank, so the words don't go", async () => {
    const { leadId, chatId } = await aChat(1);
    expect(await tell(leadId, "proof-13", "confirmed", { trip: null })).toBe("task");
    expect(await outgoing(chatId)).toHaveLength(0);
  });

  it("with no real name the words don't go, and the task names the customer", async () => {
    const { leadId, chatId } = await aChat(1, { name: "WhatsApp +91 98000 00000" });
    expect(await tell(leadId, "proof-14")).toBe("task");
    expect(await outgoing(chatId)).toHaveLength(0);
    expect((await tasksOf(leadId))[0]?.title).toBe("Tell the customer their payment was confirmed");
  });

  it("the preview is what then goes", async () => {
    const { leadId, chatId } = await aChat(1);
    const preview = await world.inOrg((tx) => previewPaymentTelling(tx, telling(leadId, "proof-15"), now));
    expect(preview.way).toBe("message");
    expect(await outgoing(chatId)).toHaveLength(0);
    await tell(leadId, "proof-15");
    expect((await outgoing(chatId))[0]?.body).toBe(preview.way === "message" ? preview.text : "");
  });

  it("outside the window the preview says a template, or with none a task, and makes nothing", async () => {
    const { leadId } = await aChat(48, { template: true });
    expect(await world.inOrg((tx) => previewPaymentTelling(tx, telling(leadId, "proof-16"), now))).toEqual({
      way: "template",
    });
    expect(await world.inOrg((tx) => previewPaymentTelling(tx, telling(leadId, "proof-17", "not_found"), now))).toEqual(
      { way: "task" },
    );
    expect(await tasksOf(leadId)).toHaveLength(0);
  });

  it("outside the window, after the customer asked to stop, the owner gets a task and nothing is sent", async () => {
    const { leadId, chatId } = await aChat(48, { template: true, withdrawn: true });
    expect(await tell(leadId, "proof-8")).toBe("task");
    expect(await outgoing(chatId)).toHaveLength(0);
    expect(await tasksOf(leadId)).toHaveLength(1);
  });

  it("a conversation with no lead is written to directly", async () => {
    const { chatId } = await aChat(1);
    expect(await tell(null, "proof-9", "confirmed", { conversationId: chatId })).toBe("sent");
    expect(await outgoing(chatId)).toHaveLength(1);
  });

  it("a stored text with a blank nobody fills never goes as free text", async () => {
    const { leadId, chatId } = await aChat(1);
    await world.inOrg(async (tx) => {
      const current = await bookingSettingsOf(tx);
      await saveBookingSettings(tx, world.manager, current);
      await tx.bookingSettings.updateMany({ data: { paymentConfirmedText: "Hi {name}, your {agent} says thanks" } });
    });
    expect(await tell(leadId, "proof-10")).toBe("task");
    expect(await outgoing(chatId)).toHaveLength(0);
  });

  it("outside the window the approved template goes", async () => {
    const { leadId, chatId } = await aChat(48, { template: true });
    expect(await tell(leadId, "proof-2")).toBe("template");
    const messages = await outgoing(chatId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.body).toContain("Hi Asha, we received ₹12,500.00.");
    expect(await tasksOf(leadId)).toHaveLength(0);
  });

  it("outside the window with no template the owner gets one task and nothing is sent", async () => {
    const { leadId, chatId } = await aChat(48);
    expect(await tell(leadId, "proof-3", "not_found")).toBe("task");
    expect(await outgoing(chatId)).toHaveLength(0);
    const tasks = await tasksOf(leadId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("Tell Asha Rao their payment wasn't found");
    expect(tasks[0]?.assigneeUserId).toBe(world.seller.userId);
  });

  it("telling twice sends once", async () => {
    const inside = await aChat(1);
    expect(await tell(inside.leadId, "proof-4")).toBe("sent");
    expect(await tell(inside.leadId, "proof-4")).toBe("sent");
    expect(await outgoing(inside.chatId)).toHaveLength(1);
  });

  it("telling twice makes one task", async () => {
    const outside = await aChat(48);
    expect(await tell(outside.leadId, "proof-5")).toBe("task");
    expect(await tell(outside.leadId, "proof-5")).toBe("task");
    expect(await tasksOf(outside.leadId)).toHaveLength(1);
  });

  it("a text with an unknown blank, or one a payment can't fill, is refused in settings", async () => {
    const current = await world.inOrg((tx) => bookingSettingsOf(tx));
    const rules = [{ daysBeforeMin: 0, chargeBasisPoints: 10_000 }];
    for (const paymentConfirmedText of ["Hi {nmae}, thanks", "Hi {agent}, thanks"]) {
      const parsed = saveBookingSettingsInput.safeParse({ ...current, rules, paymentConfirmedText });
      expect(parsed.success).toBe(false);
    }
    expect(
      saveBookingSettingsInput.safeParse({
        ...current,
        rules,
        paymentConfirmedText: "Hi {name}, {amount} {trip} {date}",
      }).success,
    ).toBe(true);
  });
});
