// Payments to check: one list of every payment waiting for a person, oldest first, within the member's lead scope.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentsToCheckInput } from "@travel-crm/contracts/bookings";
import { countPaymentsToCheck, paymentsToCheck } from "../../src/bookings/payments-to-check.js";
import { aLead } from "../crm/support/records.js";
import { aQuote, openWorld, type World } from "./support.js";

let counter = 0;

describe("payments to check", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Payments to check");
  });
  afterAll(async () => {
    await world.close();
  });

  async function aChat(personId: string | null) {
    return world.inOrg(async (tx) => {
      const connection =
        (await tx.whatsappConnection.findFirst({ select: { id: true } })) ??
        (await tx.whatsappConnection.create({
          data: {
            integratedNumber: "919000000001",
            displayNumber: "+919000000001",
            mode: "new_number",
            status: "connected",
          },
          select: { id: true },
        }));
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.id, phoneE164: `+91${String((counter += 1)).padStart(10, "7")}`, personId },
        select: { id: true },
      });
      const message = await tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: "in",
          origin: "customer",
          kind: "image",
          wamid: `wamid.${crypto.randomUUID()}`,
          status: "received",
          occurredAt: new Date(),
        },
        select: { id: true },
      });
      return { conversationId: chat.id, messageId: message.id };
    });
  }

  async function seed(ownerUserId: string) {
    return world.inOrg(async (tx) => {
      const { lead, quote } = await aQuote(tx, { ownerUserId, totalPaise: 4_000_000 });
      const booking = await tx.booking.create({
        data: {
          quoteId: quote.id,
          leadId: lead.id,
          number: `BK-2026-${String((counter += 1)).padStart(4, "0")}`,
          startDate: new Date("2026-12-20"),
        },
        select: { id: true },
      });
      const claim = await tx.paymentClaim.create({
        data: { bookingId: booking.id, amountPaise: 1_000_000n, reference: "UTR1" },
        select: { id: true },
      });
      const aiLead = await aLead(tx, { ownerUserId });
      const chat = await tx.whatsappConversation.findFirst({ select: { id: true } });
      const ai = await tx.aiBooking.create({
        data: {
          leadId: aiLead.id,
          conversationId: chat?.id ?? crypto.randomUUID(),
          summary: "Manali 5N",
          details: { amount: "₹20,000" },
          status: "proof_received",
          proofMessageIds: [crypto.randomUUID(), crypto.randomUUID()],
        },
        select: { id: true, proofMessageIds: true },
      });
      return { claimId: claim.id, aiId: ai.id, lastProof: ai.proofMessageIds.at(-1) };
    });
  }

  it("lists a claim, an AI booking's proof and a proof to match, oldest first", async () => {
    const mine = await seed(world.seller.userId);
    const chat = await aChat(null);
    await world.inOrg((tx) =>
      tx.paymentProof.create({ data: { conversationId: chat.conversationId, messageId: chat.messageId } }),
    );
    const page = await world.inOrg((tx) => paymentsToCheck(tx, world.manager, {}));
    const ours = page.items.filter((item) => [mine.claimId, mine.aiId].includes(item.id) || item.kind === "proof");
    expect(ours.map((item) => item.kind)).toEqual(["claim", "ai_booking", "proof"]);
    const [claim, ai, proof] = ours;
    expect(claim).toMatchObject({
      claimedPaise: 1_000_000,
      reference: "UTR1",
      date: "2026-12-20",
      trip: "Spiti 6 days",
    });
    // What the AI wrote as the amount is only its note: code asked no amount, so none is expected.
    expect(ai).toMatchObject({
      trip: "Manali 5N",
      expectedPaise: null,
      aiNote: "₹20,000",
      screenshot: { kind: "chat_message", id: mine.lastProof },
    });
    expect(claim).toMatchObject({ aiNote: null });
    expect(proof).toMatchObject({
      screenshot: { kind: "chat_message", id: chat.messageId },
      conversationId: chat.conversationId,
      person: { leadId: null },
    });
    const times = ours.map((item) => item.createdAt);
    expect([...times].sort()).toEqual(times);
  });

  it("leaves out decided ones", async () => {
    const mine = await seed(world.seller.userId);
    await world.inOrg(async (tx) => {
      await tx.paymentClaim.update({
        where: { id: mine.claimId },
        data: { status: "rejected", rejectReason: "not_found", decidedBy: world.manager.userId, decidedAt: new Date() },
      });
      await tx.aiBooking.update({ where: { id: mine.aiId }, data: { status: "confirmed" } });
    });
    const page = await world.inOrg((tx) => paymentsToCheck(tx, world.manager, {}));
    expect(page.items.map((item) => item.id)).not.toContain(mine.claimId);
    expect(page.items.map((item) => item.id)).not.toContain(mine.aiId);
  });

  it("a member who sees only their own leads sees only theirs", async () => {
    const mine = await seed(world.seller.userId);
    const theirs = await seed(crypto.randomUUID());
    const page = await world.inOrg((tx) => paymentsToCheck(tx, world.seller, {}));
    const ids = page.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining([mine.claimId, mine.aiId]));
    expect(ids).not.toContain(theirs.claimId);
    expect(ids).not.toContain(theirs.aiId);
    expect(page.items.every((item) => item.person.leadId !== null)).toBe(true);
  });

  it("an AI booking waits since its latest proof; a nameless proof shows the chat's phone", async () => {
    const chat = await aChat(null);
    const proofAt = new Date("2026-11-01T10:00:00Z");
    await world.inOrg(async (tx) => {
      await tx.whatsappMessage.update({ where: { id: chat.messageId }, data: { occurredAt: proofAt } });
      await tx.paymentProof.create({ data: { conversationId: chat.conversationId, messageId: chat.messageId } });
      const lead = await aLead(tx, { ownerUserId: world.seller.userId });
      await tx.aiBooking.create({
        data: {
          leadId: lead.id,
          conversationId: chat.conversationId,
          summary: "Leh",
          status: "proof_received",
          proofMessageIds: [chat.messageId],
        },
      });
    });
    const page = await world.inOrg((tx) => paymentsToCheck(tx, world.manager, {}));
    const ai = page.items.find((item) => item.trip === "Leh");
    expect(ai?.waitingSince).toBe(proofAt.toISOString());
    expect(ai?.createdAt).not.toBe(ai?.waitingSince);
    const proof = page.items.find((item) => item.kind === "proof" && item.conversationId === chat.conversationId);
    expect(proof?.person.name).toMatch(/^\+91\d+$/);
    expect(proof?.waitingSince).toBe(proof?.createdAt);
  });

  it("a malformed cursor is refused by the contract", () => {
    expect(paymentsToCheckInput.safeParse({ cursor: "not an id" }).success).toBe(false);
    expect(paymentsToCheckInput.safeParse({ cursor: crypto.randomUUID() }).success).toBe(true);
  });

  it("pages 30+ items from three sources, each once, in order, ending with no cursor", async () => {
    const fresh = await openWorld("Payments paging");
    try {
      const inFresh = fresh.inOrg;
      const connection = await inFresh((tx) =>
        tx.whatsappConnection.create({
          data: {
            integratedNumber: "919000000002",
            displayNumber: "+919000000002",
            mode: "new_number",
            status: "connected",
          },
          select: { id: true },
        }),
      );
      const expected: string[] = [];
      for (let i = 0; i < 36; i += 1) {
        const id = await inFresh(async (tx) => {
          if (i % 3 === 0) {
            const { lead, quote } = await aQuote(tx, { ownerUserId: fresh.seller.userId });
            counter += 1;
            const booking = await tx.booking.create({
              data: { quoteId: quote.id, leadId: lead.id, number: `BK-2026-${String(counter).padStart(4, "0")}` },
              select: { id: true },
            });
            return (
              await tx.paymentClaim.create({
                data: { bookingId: booking.id, amountPaise: 1000n },
                select: { id: true },
              })
            ).id;
          }
          if (i % 3 === 1) {
            const lead = await aLead(tx, { ownerUserId: fresh.seller.userId });
            return (
              await tx.aiBooking.create({
                data: { leadId: lead.id, conversationId: crypto.randomUUID(), summary: "T", status: "proof_received" },
                select: { id: true },
              })
            ).id;
          }
          const chat = await tx.whatsappConversation.create({
            data: { connectionId: connection.id, phoneE164: `+9198${String(i).padStart(8, "0")}` },
            select: { id: true },
          });
          const message = await tx.whatsappMessage.create({
            data: {
              conversationId: chat.id,
              direction: "in",
              origin: "customer",
              kind: "image",
              wamid: `wamid.${crypto.randomUUID()}`,
              status: "received",
              occurredAt: new Date(),
            },
            select: { id: true },
          });
          return (
            await tx.paymentProof.create({
              data: { conversationId: chat.id, messageId: message.id },
              select: { id: true },
            })
          ).id;
        });
        expected.push(id);
      }
      expected.sort();
      const pages: string[][] = [];
      let cursor: string | undefined;
      let last: string | null = null;
      do {
        const page = await inFresh((tx) => paymentsToCheck(tx, fresh.manager, { cursor }));
        pages.push(page.items.map((item) => item.id));
        last = page.nextCursor;
        cursor = last ?? undefined;
      } while (last !== null);
      expect(pages.map((ids) => ids.length)).toEqual([25, 11]);
      expect(pages.flat()).toEqual(expected);
    } finally {
      await fresh.close();
    }
  });

  it("counts what waits, and pages by 25 with a cursor", async () => {
    const before = await world.inOrg((tx) => countPaymentsToCheck(tx, world.manager));
    for (let i = 0; i < 2; i += 1) await seed(world.seller.userId);
    const after = await world.inOrg((tx) => countPaymentsToCheck(tx, world.manager));
    expect(after).toBe(before + 4);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await world.inOrg((tx) => paymentsToCheck(tx, world.manager, { cursor }));
      expect(page.items.length).toBeLessThanOrEqual(25);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    expect(seen).toHaveLength(after);
    expect(new Set(seen).size).toBe(after);
  });

  it("an AI booking with an advance code worked out expects it, with no note", async () => {
    const mine = await seed(world.seller.userId);
    await world.inOrg((tx) => tx.aiBooking.update({ where: { id: mine.aiId }, data: { expectedPaise: 1_500_000n } }));
    const page = await world.inOrg((tx) => paymentsToCheck(tx, world.manager, {}));
    expect(page.items.find((item) => item.id === mine.aiId)).toMatchObject({ expectedPaise: 1_500_000, aiNote: null });
  });
});
