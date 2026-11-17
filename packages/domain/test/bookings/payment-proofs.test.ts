// Payments to check: a screenshot a customer sends while no booking waits for payment is kept as a proof for a person to match,
// once however often it is delivered, but only where a payment is likely (payment details sent lately, money due on a
// quote); with an open booking it is that booking's proof; one notice a chat a day; dismissing one is audited.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiPaymentProofListener } from "../../src/ai/booking.js";
import { takeBooking } from "./ai-booking-fixture.js";
import { dismissProof } from "../../src/bookings/index.js";
import type { EventListener } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import type { Entitlements } from "../../src/subscriptions/index.js";
import { aLead } from "../crm/support/records.js";
import { aConnectedAgency, createTestInbox, testNow, type TestConnection, type TestInbox } from "../inbox/support.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

type ModuleName = Entitlements["modules"] extends ReadonlySet<infer M> ? M : never;
const entitlements = (modules: ModuleName[]): Entitlements => ({
  status: "active",
  access: "full",
  planName: "Test",
  modules: new Set(modules),
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
});

describe("payment proofs with no booking waiting", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const managerId = randomUUID();
  const listenerFor = (modules: ModuleName[] = ["crm", "inbox", "bookings"]) =>
    aiPaymentProofListener({
      recipients: () => Promise.resolve([managerId]),
      subscriptions: { entitlementsOf: () => Promise.resolve(entitlements(modules)) },
    });

  async function aChat(connection: TestConnection) {
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(connection.organizationId, work);
    const ownerUserId = randomUUID();
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId }));
    const chat = await inOrg((tx) =>
      tx.whatsappConversation.create({
        data: {
          connectionId: connection.connectionId,
          phoneE164: `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
          personId: lead.personId,
        },
        select: { id: true },
      }),
    );
    const message = (kind: string) =>
      inOrg((tx) =>
        tx.whatsappMessage.create({
          data: {
            conversationId: chat.id,
            direction: "in",
            origin: "customer",
            kind,
            body: kind === "text" ? "paid" : null,
            wamid: `wamid.${randomUUID()}`,
            status: "received",
            occurredAt: new Date(),
          },
          select: { id: true },
        }),
      );
    /** Something the agency sent in the chat, marked by its client token, some days before now. */
    const sent = (clientToken: string, daysAgo = 1) =>
      inOrg((tx) =>
        tx.whatsappMessage.create({
          data: {
            conversationId: chat.id,
            direction: "out",
            origin: "automation",
            kind: "text",
            body: "Pay by UPI to agency@upi",
            clientToken,
            status: "sent",
            occurredAt: new Date(Date.now() - daysAgo * 86_400_000),
          },
          select: { id: true },
        }),
      );
    /** A quote for the lead with some of it paid. */
    const quoted = (status: "sent" | "accepted", totalPaise: number, paidPaise = 0) =>
      inOrg(async (tx) => {
        const quote = await tx.quote.create({
          data: {
            leadId: lead.id,
            title: "Manali",
            status,
            subtotalPaise: BigInt(totalPaise),
            totalPaise: BigInt(totalPaise),
          },
          select: { id: true },
        });
        if (paidPaise > 0)
          await tx.quotePayment.create({
            data: { quoteId: quote.id, amountPaise: BigInt(paidPaise), receivedOn: new Date(), method: "upi" },
          });
      });
    return { inOrg, lead, chatId: chat.id, ownerUserId, message, sent, quoted };
  }

  const deliver = (listener: EventListener, connection: TestConnection, chatId: string, messageId: string) =>
    listener.handle(
      {
        id: randomUUID(),
        organizationId: connection.organizationId,
        type: "whatsapp.customer-wrote",
        payload: { conversationId: chatId, messageId, firstEver: false },
        occurredAt: testNow,
      },
      {
        actor: systemActor(connection.organizationId),
        forOrg: (work) => test.db.forOrg(connection.organizationId, work),
      },
    );

  it("a screenshot with no open booking becomes one proof to match, and a second delivery adds nothing", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, lead, chatId, ownerUserId, message, sent } = await aChat(connection);
    await sent(`ai-pay:${randomUUID()}`);
    const image = await message("image");
    const listener = listenerFor();
    await deliver(listener, connection, chatId, image.id);
    await deliver(listener, connection, chatId, image.id);
    const proofs = await inOrg((tx) => tx.paymentProof.findMany());
    expect(proofs).toHaveLength(1);
    expect(proofs[0]).toMatchObject({
      conversationId: chatId,
      messageId: image.id,
      leadId: lead.id,
      status: "pending",
    });
    const notices = await inOrg((tx) => tx.notification.findMany({ where: { kind: "payment.proof-to-match" } }));
    expect(notices.every((notice) => notice.link === `/inbox/${chatId}`)).toBe(true);
    expect(notices.map((notice) => notice.recipientUserId).sort()).toEqual([ownerUserId, managerId].sort());
    // A booking the AI takes later in the chat leaves the proof as it was.
    await inOrg((tx) =>
      takeBooking(tx, {
        organizationId: connection.organizationId,
        conversationId: chatId,
        leadId: lead.id,
        booking: { confirmed: true, summary: "Manali", package: "", dates: "", travellers: "", pickup: "", amount: "" },
        recipients: [],
        now: new Date(testNow.getTime() + 1000),
      }),
    );
    expect(await inOrg((tx) => tx.paymentProof.count())).toBe(1);
    expect(await inOrg((tx) => tx.aiBooking.findFirstOrThrow({ select: { proofMessageIds: true } }))).toMatchObject({
      proofMessageIds: [],
    });
  });

  it.each(["ai:turn-1:pay", "ai:turn-1:qr"])(
    "payment details or a QR the AI sent (%s) make a photo a proof",
    async (token) => {
      const connection = await aConnectedAgency(test);
      const { inOrg, chatId, message, sent } = await aChat(connection);
      await sent(token, 13);
      const image = await message("image");
      await deliver(listenerFor(), connection, chatId, image.id);
      expect(await inOrg((tx) => tx.paymentProof.count())).toBe(1);
    },
  );

  it("payment details sent more than 14 days before don't", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, chatId, message, sent } = await aChat(connection);
    await sent(`ai-pay:${randomUUID()}`, 15);
    const image = await message("image");
    await deliver(listenerFor(), connection, chatId, image.id);
    expect(await inOrg((tx) => tx.paymentProof.count())).toBe(0);
  });

  it("money still due on a sent or accepted quote makes a photo a proof; a quote paid in full doesn't", async () => {
    const connection = await aConnectedAgency(test);
    const due = await aChat(connection);
    await due.quoted("accepted", 100_000, 40_000);
    const image = await due.message("image");
    await deliver(listenerFor(), connection, due.chatId, image.id);
    expect(await due.inOrg((tx) => tx.paymentProof.count({ where: { conversationId: due.chatId } }))).toBe(1);

    const paid = await aChat(connection);
    await paid.quoted("accepted", 100_000, 100_000);
    const photo = await paid.message("image");
    await deliver(listenerFor(), connection, paid.chatId, photo.id);
    expect(await paid.inOrg((tx) => tx.paymentProof.count({ where: { conversationId: paid.chatId } }))).toBe(0);
  });

  it("a passport photo in a chat with nothing to pay is no proof", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, chatId, message } = await aChat(connection);
    const passport = await message("image");
    await deliver(listenerFor(), connection, chatId, passport.id);
    expect(await inOrg((tx) => tx.paymentProof.count())).toBe(0);
    expect(await inOrg((tx) => tx.notification.count())).toBe(0);
  });

  it("two photos on one day are two proofs but one notice each, which doesn't call them payments", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, chatId, message, sent, ownerUserId } = await aChat(connection);
    await sent(`ai-pay:${randomUUID()}`);
    const listener = listenerFor();
    for (const kind of ["image", "document"]) {
      const file = await message(kind);
      await deliver(listener, connection, chatId, file.id);
    }
    expect(await inOrg((tx) => tx.paymentProof.count())).toBe(2);
    const notices = await inOrg((tx) => tx.notification.findMany({ where: { kind: "payment.proof-to-match" } }));
    expect(notices.map((notice) => notice.recipientUserId).sort()).toEqual([ownerUserId, managerId].sort());
    expect(notices[0]?.title).toMatch(/sent a photo or file that may be a payment$/);
  });

  it("keeps nothing in an agency without the bookings module", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, chatId, message } = await aChat(connection);
    const image = await message("document");
    await deliver(listenerFor(["crm", "inbox"]), connection, chatId, image.id);
    expect(await inOrg((tx) => tx.paymentProof.count())).toBe(0);
  });

  it("with an open booking it is that booking's proof, as before", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, lead, chatId, message } = await aChat(connection);
    await inOrg((tx) =>
      takeBooking(tx, {
        organizationId: connection.organizationId,
        conversationId: chatId,
        leadId: lead.id,
        booking: { confirmed: true, summary: "Manali", package: "", dates: "", travellers: "", pickup: "", amount: "" },
        recipients: [],
        now: new Date(testNow.getTime() - 1000),
      }),
    );
    const image = await message("image");
    await deliver(listenerFor(), connection, chatId, image.id);
    const second = await message("image");
    await deliver(listenerFor(), connection, chatId, second.id);
    expect(await inOrg((tx) => tx.paymentProof.count())).toBe(0);
    expect(await inOrg((tx) => tx.aiBooking.findFirstOrThrow())).toMatchObject({
      status: "proof_received",
      proofMessageIds: [image.id, second.id],
    });
    // One notice a day for the chat, however many files came, and it says only that it may be a payment.
    const notices = await inOrg((tx) => tx.notification.findMany({ where: { kind: "ai.payment-proof" } }));
    expect(notices).toHaveLength(2);
    expect(new Set(notices.map((notice) => notice.recipientUserId)).size).toBe(2);
    expect(notices[0]?.title).toMatch(/sent a photo or file that may be a payment$/);
    // With bookings, the payment is confirmed on Payments to check; the lead's id lets its erasure find the notice.
    expect(notices.every((notice) => notice.link === `/payments?lead=${lead.id}`)).toBe(true);
  });

  it("without the bookings module, the notice about an open booking's proof opens the lead", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, lead, chatId, message } = await aChat(connection);
    await inOrg((tx) =>
      takeBooking(tx, {
        organizationId: connection.organizationId,
        conversationId: chatId,
        leadId: lead.id,
        booking: { confirmed: true, summary: "Manali", package: "", dates: "", travellers: "", pickup: "", amount: "" },
        recipients: [],
        now: new Date(testNow.getTime() - 1000),
      }),
    );
    const image = await message("image");
    await deliver(listenerFor(["crm", "inbox"]), connection, chatId, image.id);
    const notices = await inOrg((tx) => tx.notification.findMany({ where: { kind: "ai.payment-proof" } }));
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.every((notice) => notice.link === `/leads/${lead.id}`)).toBe(true);
  });

  it("a text message is no proof", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, chatId, message } = await aChat(connection);
    const text = await message("text");
    await deliver(listenerFor(), connection, chatId, text.id);
    expect(await inOrg((tx) => tx.paymentProof.count())).toBe(0);
  });

  it("dismissing is audited and leaves the list", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, chatId, message, quoted } = await aChat(connection);
    await quoted("sent", 100_000);
    const image = await message("image");
    await deliver(listenerFor(), connection, chatId, image.id);
    const proof = await inOrg((tx) => tx.paymentProof.findFirstOrThrow());
    const access = memberWithStarterRole("org-owner", {
      organizationId: connection.organizationId,
      userId: randomUUID(),
    });
    await inOrg((tx) => dismissProof(tx, access, { proofId: proof.id }));
    await inOrg((tx) => dismissProof(tx, access, { proofId: proof.id }));
    expect(await inOrg((tx) => tx.paymentProof.findFirstOrThrow())).toMatchObject({
      status: "dismissed",
      decidedBy: access.userId,
    });
    expect(await inOrg((tx) => tx.paymentProof.count({ where: { status: "pending" } }))).toBe(0);
    const audits = await inOrg((tx) => tx.auditEntry.findMany({ where: { action: "payment-proof.dismissed" } }));
    expect(audits).toHaveLength(1);
  });

  it("a member who sees only their own leads can't dismiss a proof with no lead, or on another's lead", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, lead, chatId, message, ownerUserId } = await aChat(connection);
    const proofOf = async (leadId: string | null) => {
      const file = await message("image");
      return inOrg((tx) =>
        tx.paymentProof.create({ data: { conversationId: chatId, messageId: file.id, leadId }, select: { id: true } }),
      );
    };
    const orphan = await proofOf(null);
    const theirs = await proofOf(lead.id);
    const own = memberWithStarterRole("sales", { organizationId: connection.organizationId, userId: randomUUID() });
    for (const proof of [orphan, theirs]) {
      await expect(inOrg((tx) => dismissProof(tx, own, { proofId: proof.id }))).rejects.toMatchObject({
        reason: "NOT_FOUND",
      });
    }
    // The lead's owner, seeing only their own, may.
    const owner = memberWithStarterRole("sales", { organizationId: connection.organizationId, userId: ownerUserId });
    await inOrg((tx) => dismissProof(tx, owner, { proofId: theirs.id }));
    expect(await inOrg((tx) => tx.paymentProof.count({ where: { status: "pending" } }))).toBe(1);
  });

  it("a dismissal that finds the proof dismissed meanwhile writes nothing more", async () => {
    const connection = await aConnectedAgency(test);
    const { inOrg, chatId, message } = await aChat(connection);
    const file = await message("image");
    const proof = await inOrg((tx) =>
      tx.paymentProof.create({ data: { conversationId: chatId, messageId: file.id }, select: { id: true } }),
    );
    const member = () =>
      memberWithStarterRole("org-owner", { organizationId: connection.organizationId, userId: randomUUID() });
    // Someone else dismisses it and hasn't committed yet: this dismissal reads it pending, then waits on the row.
    const held = Promise.withResolvers<undefined>();
    const isChanged = Promise.withResolvers<undefined>();
    const first = inOrg(async (tx) => {
      await tx.paymentProof.update({ where: { id: proof.id }, data: { status: "dismissed", decidedAt: new Date() } });
      isChanged.resolve(undefined);
      await held.promise;
    });
    await isChanged.promise;
    const second = inOrg((tx) => dismissProof(tx, member(), { proofId: proof.id }));
    setTimeout(() => {
      held.resolve(undefined);
    }, 300);
    await Promise.all([first, second]);
    const audits = await inOrg((tx) =>
      tx.auditEntry.count({ where: { action: "payment-proof.dismissed", entityId: proof.id } }),
    );
    expect(audits).toBe(0);
  });
});
