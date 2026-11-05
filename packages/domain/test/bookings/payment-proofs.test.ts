// Payments to check: a screenshot a customer sends while no booking waits for payment is kept as a proof for a person to match,
// once however often it is delivered; with an open booking it is that booking's proof; dismissing one is audited.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiPaymentProofListener, takeBooking } from "../../src/ai/booking.js";
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
          phoneE164: `+91${String(Date.now())}`.slice(0, 13),
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
    return { inOrg, lead, chatId: chat.id, ownerUserId, message };
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
    const { inOrg, lead, chatId, ownerUserId, message } = await aChat(connection);
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
    expect(await inOrg((tx) => tx.paymentProof.count())).toBe(0);
    expect(await inOrg((tx) => tx.aiBooking.findFirstOrThrow())).toMatchObject({
      status: "proof_received",
      proofMessageIds: [image.id],
    });
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
    const { inOrg, chatId, message } = await aChat(connection);
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
});
