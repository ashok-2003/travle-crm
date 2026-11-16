// paymentsToCheck: only a member who may view bookings and record payments, on a plan with bookings, lists or decides.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PermissionSet } from "@travel-crm/domain/identity";
import { anAgency, callerOf, memberOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("paymentsToCheck", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  async function anAiBooking(organizationId: string, ownerUserId: string | null = null) {
    return harness.db.forOrg(organizationId, async (tx) => {
      const person = await tx.person.create({
        data: { name: "Rahul Sharma", phoneE164: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
      });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "web_form", ownerUserId } });
      const booking = await tx.aiBooking.create({
        data: {
          leadId: lead.id,
          conversationId: randomUUID(),
          summary: "Manali 5N",
          details: { amount: "₹20,000" },
          status: "proof_received",
          proofMessageIds: [randomUUID()],
        },
        select: { id: true },
      });
      return { leadId: lead.id, bookingId: booking.id };
    });
  }

  it("a member without record_payments can't list or confirm", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const { caller } = callerOf(harness, { organizationId, granted: ["bookings:view"] });
    expect(await refusal(caller.paymentsToCheck.list({}))).toBe("MISSING_PERMISSION");
    expect(await refusal(caller.paymentsToCheck.count())).toBe("MISSING_PERMISSION");
    expect(
      await refusal(
        caller.paymentsToCheck.confirm({ kind: "claim", id: randomUUID(), amountPaise: 100, reference: "" }),
      ),
    ).toBe("MISSING_PERMISSION");
  });

  it("an agency without the bookings module can't list", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm"] });
    const { caller } = callerOf(harness, { organizationId });
    expect(await refusal(caller.paymentsToCheck.list({}))).toBe("MODULE_NOT_ON_PLAN");
    expect(await refusal(caller.paymentsToCheck.count())).toBe("MODULE_NOT_ON_PLAN");
  });

  it("lists and counts what waits for a member who may", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    const page = await caller.paymentsToCheck.list({});
    expect(page.items.map((item) => item.id)).toEqual([ai.bookingId]);
    expect(await caller.paymentsToCheck.count()).toEqual({ count: 1 });
  });

  it("confirm says how the customer was told, and a repeat tells no one twice", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    const input = { kind: "ai_booking", id: ai.bookingId, amountPaise: 2_000_000, reference: "UTR9" } as const;
    // The customer has no chat here, so nothing can be sent: one task for the lead's owner tells them by hand.
    expect(await caller.paymentsToCheck.confirm(input)).toEqual({ told: "task" });
    expect(await caller.paymentsToCheck.confirm(input)).toEqual({ told: "task" });
    const tasks = await harness.db.forOrg(organizationId, (tx) =>
      tx.task.count({ where: { title: { contains: "payment was confirmed" } } }),
    );
    expect(tasks).toBe(1);
    expect(await caller.paymentsToCheck.count()).toEqual({ count: 0 });
  });

  it("refuse tells the customer only when asked", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const quiet = await anAiBooking(organizationId);
    const loud = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    expect(
      await caller.paymentsToCheck.refuse({
        kind: "ai_booking",
        id: quiet.bookingId,
        reason: "not_found",
        tell: false,
      }),
    ).toEqual({ told: "none" });
    expect(
      await caller.paymentsToCheck.refuse({ kind: "ai_booking", id: loud.bookingId, reason: "not_found", tell: true }),
    ).toEqual({ told: "task" });
  });

  /** A member who sees only the leads they own. */
  function ownMember(organizationId: string) {
    const member = memberOf(organizationId, ["bookings:view", "quotes:record_payments"]);
    return {
      ...member,
      permissions: PermissionSet.of([
        { permission: "bookings:view", scope: "own" },
        { permission: "quotes:view", scope: "own" },
        { permission: "quotes:record_payments", scope: "all" },
      ]),
    };
  }

  async function aClaim(organizationId: string, ownerUserId: string | null = null, withChat = false) {
    return harness.db.forOrg(organizationId, async (tx) => {
      const person = await tx.person.create({
        data: { name: "Rahul Sharma", phoneE164: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
      });
      const lead = await tx.lead.create({ data: { personId: person.id, source: "web_form", ownerUserId } });
      if (withChat) {
        // An open chat inside the 24-hour window, and the customer's consent: the confirmation goes as free text.
        const connection = await tx.whatsappConnection.create({
          data: {
            integratedNumber: `91${String(Math.floor(Math.random() * 1e8))}`,
            displayNumber: "+919800000000",
            mode: "new_number",
            status: "connected",
            connectedAt: new Date(),
          },
          select: { id: true },
        });
        const phone = await tx.person.findUniqueOrThrow({ where: { id: person.id }, select: { phoneE164: true } });
        await tx.whatsappConversation.create({
          data: {
            connectionId: connection.id,
            phoneE164: phone.phoneE164 ?? "",
            personId: person.id,
            lastInboundAt: new Date(),
            lastMessageAt: new Date(),
          },
        });
        await tx.personConsent.create({
          data: {
            personId: person.id,
            purpose: "trip_updates",
            action: "granted",
            wording: "test",
            wordingVersion: 1,
            source: "staff",
            recordedAt: new Date(Date.now() - 100 * 3_600_000),
          },
        });
      }
      const quote = await tx.quote.create({
        data: {
          leadId: lead.id,
          title: "Spiti 6 days",
          status: "accepted",
          adults: 2,
          children: 0,
          days: [],
          subtotalPaise: 4_000_000n,
          totalPaise: 4_000_000n,
          acceptedAt: new Date("2026-10-29T05:00:00Z"),
          acceptedName: "Rahul Sharma",
        },
        select: { id: true },
      });
      const booking = await tx.booking.create({
        data: {
          quoteId: quote.id,
          leadId: lead.id,
          number: `BK-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        },
        select: { id: true },
      });
      const claim = await tx.paymentClaim.create({
        data: { bookingId: booking.id, amountPaise: 1_000_000n, reference: "UTR1" },
        select: { id: true },
      });
      return { claimId: claim.id };
    });
  }

  const nothingChanged = (organizationId: string) =>
    harness.db.forOrg(organizationId, async (tx) => ({
      payments: await tx.quotePayment.count(),
      tasks: await tx.task.count(),
      messages: await tx.whatsappMessage.count(),
      pendingClaims: await tx.paymentClaim.count({ where: { status: "pending" } }),
      waitingAi: await tx.aiBooking.count({ where: { status: "proof_received" } }),
    }));

  it("a member who sees only their own leads can't confirm or refuse another member's", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const someoneElse = randomUUID();
    const ai = await anAiBooking(organizationId, someoneElse);
    const theirs = await aClaim(organizationId, someoneElse);
    const { caller } = callerOf(harness, { organizationId }, ownMember(organizationId));
    const before = await nothingChanged(organizationId);
    const decisions = [
      () =>
        caller.paymentsToCheck.confirm({ kind: "ai_booking", id: ai.bookingId, amountPaise: 2_000_000, reference: "" }),
      () => caller.paymentsToCheck.refuse({ kind: "ai_booking", id: ai.bookingId, reason: "not_found", tell: true }),
      () =>
        caller.paymentsToCheck.confirm({ kind: "claim", id: theirs.claimId, amountPaise: 1_000_000, reference: "" }),
      () => caller.paymentsToCheck.refuse({ kind: "claim", id: theirs.claimId, reason: "not_found", tell: true }),
    ];
    for (const decision of decisions) expect(await refusal(decision())).toBe("NOT_FOUND");
    expect(await nothingChanged(organizationId)).toEqual(before);
    // Indistinguishable from an id that doesn't exist.
    expect(
      await refusal(
        caller.paymentsToCheck.confirm({ kind: "ai_booking", id: randomUUID(), amountPaise: 1, reference: "" }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("the same member confirms an AI booking and a claim on leads they own", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const member = ownMember(organizationId);
    const ai = await anAiBooking(organizationId, member.userId);
    const mine = await aClaim(organizationId, member.userId);
    const { caller } = callerOf(harness, { organizationId }, member);
    await caller.paymentsToCheck.confirm({
      kind: "ai_booking",
      id: ai.bookingId,
      amountPaise: 2_000_000,
      reference: "",
    });
    await caller.paymentsToCheck.confirm({ kind: "claim", id: mine.claimId, amountPaise: 1_000_000, reference: "" });
    expect((await nothingChanged(organizationId)).payments).toBe(2);
  });

  it("confirming a claim records and tells the amount the person entered", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const { claimId } = await aClaim(organizationId, null, true);
    const { caller } = callerOf(harness, { organizationId });
    const told = await caller.paymentsToCheck.confirm({
      kind: "claim",
      id: claimId,
      amountPaise: 900_000,
      reference: "",
    });
    expect(told).toEqual({ told: "sent" });
    // The message carries what the person entered (₹9,000.00), not what the customer claimed (₹10,000.00).
    const sent = await harness.db.forOrg(organizationId, (tx) =>
      tx.whatsappMessage.findMany({ select: { body: true } }),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toContain("₹9,000.00");
    expect(sent[0]?.body).not.toContain("10,000");
    const recorded = await harness.db.forOrg(organizationId, (tx) => tx.quotePayment.findMany());
    expect(recorded.map((payment) => Number(payment.amountPaise))).toEqual([900_000]);
  });

  it("refusing a claim without telling sends nothing and makes no task", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const { claimId } = await aClaim(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    const before = await nothingChanged(organizationId);
    expect(before.pendingClaims).toBe(1);
    expect(
      await caller.paymentsToCheck.refuse({ kind: "claim", id: claimId, reason: "not_found", tell: false }),
    ).toEqual({ told: "none" });
    const after = await nothingChanged(organizationId);
    expect(after.messages).toBe(before.messages);
    expect(after.pendingClaims).toBe(0);
    expect(after.tasks).toBe(before.tasks);
  });

  it("the preview needs the list's permissions, and its words are what the confirmation then sends", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const { claimId } = await aClaim(organizationId, null, true);
    const input = { kind: "claim", id: claimId, outcome: "confirm", amountPaise: 900_000 } as const;
    const { caller: accountsless } = callerOf(harness, { organizationId, granted: ["bookings:view"] });
    expect(await refusal(accountsless.paymentsToCheck.preview(input))).toBe("MISSING_PERMISSION");
    const { caller } = callerOf(harness, { organizationId });
    const preview = await caller.paymentsToCheck.preview(input);
    expect(preview).toMatchObject({ way: "message", text: expect.stringContaining("₹9,000.00") as unknown });
    // The preview changes nothing.
    expect(await harness.db.forOrg(organizationId, (tx) => tx.whatsappMessage.count())).toBe(0);
    await caller.paymentsToCheck.confirm({ kind: "claim", id: claimId, amountPaise: 900_000, reference: "" });
    const sent = await harness.db.forOrg(organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow());
    expect(sent.body).toBe(preview.way === "message" ? preview.text : null);
  });

  it("an AI booking with nothing to say its amount previews a task for a not found, never ₹0.00", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    expect(
      await caller.paymentsToCheck.preview({ kind: "ai_booking", id: ai.bookingId, outcome: "not_found" }),
    ).toEqual({ way: "task" });
  });

  it("refusing an AI booking again after a new screenshot tells the customer again; one refusal tells once", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    const refuse = () =>
      caller.paymentsToCheck.refuse({ kind: "ai_booking", id: ai.bookingId, reason: "not_found", tell: true });
    const tasks = () =>
      harness.db.forOrg(organizationId, (tx) => tx.task.count({ where: { title: { contains: "wasn't found" } } }));
    expect(await refuse()).toEqual({ told: "task" });
    expect(await refusal(refuse())).toBe("AI_BOOKING_NOT_OPEN");
    expect(await tasks()).toBe(1);
    // The customer sends a new screenshot: the booking waits for a person again, and a second refusal is a new telling.
    await harness.db.forOrg(organizationId, (tx) =>
      tx.aiBooking.update({
        where: { id: ai.bookingId },
        data: { status: "proof_received", proofMessageIds: { push: randomUUID() } },
      }),
    );
    expect(await refuse()).toEqual({ told: "task" });
    expect(await tasks()).toBe(2);
  });

  it("a second confirmation with another amount is refused and tells nobody", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId);
    const { claimId } = await aClaim(organizationId);
    const { caller } = callerOf(harness, { organizationId });
    await caller.paymentsToCheck.confirm({
      kind: "ai_booking",
      id: ai.bookingId,
      amountPaise: 2_000_000,
      reference: "",
    });
    await caller.paymentsToCheck.confirm({ kind: "claim", id: claimId, amountPaise: 1_000_000, reference: "" });
    const before = await nothingChanged(organizationId);
    expect(
      await refusal(
        caller.paymentsToCheck.confirm({ kind: "ai_booking", id: ai.bookingId, amountPaise: 1_500_000, reference: "" }),
      ),
    ).toBe("PAYMENT_CONFIRMED_OTHER_AMOUNT");
    expect(
      await refusal(
        caller.paymentsToCheck.confirm({ kind: "claim", id: claimId, amountPaise: 900_000, reference: "" }),
      ),
    ).toBe("PAYMENT_CONFIRMED_OTHER_AMOUNT");
    expect(await nothingChanged(organizationId)).toEqual(before);
  });

  /** Stand-in files: every record holds one picture, and its link names the record and the file. */
  const files = {
    list: (_actor: unknown, record: { recordType: string; recordId: string }) =>
      Promise.resolve([
        {
          id: record.recordId,
          fileName: "screenshot.png",
          contentType: "image/png",
          sizeBytes: 100,
          sensitive: false,
          createdAt: new Date().toISOString(),
        },
      ]),
    downloadLink: (_actor: unknown, ref: { recordType: string; recordId: string; attachmentId: string }) =>
      Promise.resolve({
        url: `https://files.test/${ref.recordType}/${ref.recordId}/${ref.attachmentId}`,
        expiresAt: new Date(),
      }),
  };

  it("a member who records payments and sees bookings, and nothing else, gets the screenshot's link", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId);
    const proofId = await harness.db.forOrg(organizationId, async (tx) => {
      const row = await tx.aiBooking.findUniqueOrThrow({ where: { id: ai.bookingId } });
      return row.proofMessageIds.at(-1) ?? "";
    });
    const accounts = callerOf(harness, {
      organizationId,
      granted: ["bookings:view", "quotes:record_payments"],
      context: { files: files as never },
    }).caller;
    const link = await accounts.paymentsToCheck.screenshotLink({ kind: "ai_booking", id: ai.bookingId });
    expect(link.url).toBe(`https://files.test/whatsapp_message/${proofId}/${proofId}`);
    // Without the right to record payments, no link.
    const viewer = callerOf(harness, {
      organizationId,
      granted: ["bookings:view"],
      context: { files: files as never },
    });
    expect(await refusal(viewer.caller.paymentsToCheck.screenshotLink({ kind: "ai_booking", id: ai.bookingId }))).toBe(
      "MISSING_PERMISSION",
    );
  });

  it("a screenshot on a lead the member can't see answers as one that isn't there", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const ai = await anAiBooking(organizationId, randomUUID());
    const { caller } = callerOf(
      harness,
      { organizationId, context: { files: files as never } },
      ownMember(organizationId),
    );
    expect(await refusal(caller.paymentsToCheck.screenshotLink({ kind: "ai_booking", id: ai.bookingId }))).toBe(
      "NOT_FOUND",
    );
  });

  it("confirming an AI booking on a lead with no quote previews and sends its trip as the quote made for it", async () => {
    const organizationId = await anAgency(harness, { modules: ["crm", "quotes", "bookings"] });
    const { claimId } = await aClaim(organizationId, null, true);
    // The AI booking is in the same customer's open chat.
    const bookingId = await harness.db.forOrg(organizationId, async (tx) => {
      const claim = await tx.paymentClaim.findUniqueOrThrow({
        where: { id: claimId },
        select: { booking: { select: { lead: { select: { personId: true } } } } },
      });
      const chat = await tx.whatsappConversation.findFirstOrThrow({
        where: { personId: claim.booking.lead.personId },
        select: { id: true },
      });
      const lead = await tx.lead.create({ data: { personId: claim.booking.lead.personId, source: "whatsapp" } });
      const ai = await tx.aiBooking.create({
        data: {
          leadId: lead.id,
          conversationId: chat.id,
          summary: "Manali 5N",
          details: { amount: "₹4,000" },
          status: "proof_received",
          proofMessageIds: [randomUUID()],
        },
        select: { id: true },
      });
      return ai.id;
    });
    const { caller } = callerOf(harness, { organizationId });
    const preview = await caller.paymentsToCheck.preview({
      kind: "ai_booking",
      id: bookingId,
      outcome: "confirm",
      amountPaise: 400_000,
    });
    expect(preview).toMatchObject({
      way: "message",
      text: expect.stringContaining("₹4,000.00 for Manali 5N") as unknown,
    });
    expect(
      await caller.paymentsToCheck.confirm({ kind: "ai_booking", id: bookingId, amountPaise: 400_000, reference: "" }),
    ).toEqual({ told: "sent" });
    const sent = await harness.db.forOrg(organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow());
    expect(sent.body).toBe(preview.way === "message" ? preview.text : null);
  });
});
