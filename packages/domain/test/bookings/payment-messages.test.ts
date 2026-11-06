// Telling the customer a person's decision about their payment: the agency's own words inside the 24-hour window, its approved
// template outside it, else one task for the lead's owner; a repeat of the same decision changes nothing.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseCalendarDate } from "../../src/kernel/index.js";
import { bookingSettingsOf, saveBookingSettings } from "../../src/bookings/settings.js";
import { tellPaymentOutcome } from "../../src/bookings/payment-messages.js";
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
  async function aChat(hoursAgo: number, options: { template?: boolean } = {}) {
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
      const person = await aPerson(tx, { name: "Asha Rao" });
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

  const tell = (leadId: string, recordKey: string, outcome: "confirmed" | "not_found" = "confirmed") =>
    world.inOrg((tx) =>
      tellPaymentOutcome(
        tx,
        {
          organizationId: world.organizationId,
          leadId,
          conversationId: null,
          outcome,
          amountPaise: 1_250_000,
          trip: "Manali 5N",
          date: parseCalendarDate("2026-10-16"),
          recordKey,
        },
        now,
      ),
    );

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
      "Thank you Asha! We have received ₹12,500.00 for Manali 5N on 16 Oct. Your booking is confirmed.",
    );
    expect(await tasksOf(leadId)).toHaveLength(0);
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

  it("a text with an unknown blank is refused in settings", async () => {
    await expect(
      world.inOrg(async (tx) => {
        const current = await bookingSettingsOf(tx);
        return saveBookingSettings(tx, world.manager, { ...current, paymentConfirmedText: "Hi {nmae}, thanks" });
      }),
    ).rejects.toMatchObject({ reason: "UNKNOWN_BLANK" });
  });
});
