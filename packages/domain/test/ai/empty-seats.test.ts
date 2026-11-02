// Empty seats (release ai3): "Find interested people" is a plain query with exactly the rules (destination, last 12 months, not
// booked, holding or waiting, not blocked, no opt-out, not offered in 14 days, the viewer's own leads, at most 50); a message is
// one AI call for one person, with the price put in by code, a typed amount and an unallowed seat count taken out, and refused for
// a person the rules leave out; "Sent" marks the offer, notes the lead's timeline and audits it; a customer's erasure removes it.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { findInterestedPeople, recordOfferSent, writeSeatMessage } from "../../src/ai/index.js";
import { findDeparture } from "../../src/departures/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { eraseCustomerParts } from "../../src/platform/erase-customer.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { aBookingOn, now, openWorld, type World } from "../departures/support.js";

const reasonOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (error as { reason?: string }).reason ?? "other",
  );

const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("empty seats", () => {
  let world: World;
  let platformDb: PlatformDatabase;
  beforeAll(async () => {
    world = await openWorld("Empty seats");
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await world.close();
  });

  async function setup(
    seed: { seatsTotal?: number; pricePaise?: bigint | null; status?: string; shareSeatCounts?: boolean } = {},
  ) {
    const destination = await world.inOrg((tx) =>
      tx.destination.create({ data: { name: `Spiti ${String(Math.random())}` } }),
    );
    const elsewhere = await world.inOrg((tx) =>
      tx.destination.create({ data: { name: `Goa ${String(Math.random())}` } }),
    );
    const departure = await world.inOrg((tx) =>
      tx.departure.create({
        data: {
          title: "Spiti batch, 3 Nov",
          destinationId: destination.id,
          startDate: new Date("2026-11-03T00:00:00Z"),
          endDate: new Date("2026-11-08T00:00:00Z"),
          seatsTotal: seed.seatsTotal ?? 10,
          pricePaise: seed.pricePaise === undefined ? 1_250_000n : seed.pricePaise,
          status: seed.status ?? "open",
        },
        select: { id: true },
      }),
    );
    await world.inOrg((tx) =>
      tx.aiSettings.upsert({
        where: { organizationId: world.organizationId },
        create: { enabled: true },
        update: { enabled: true },
      }),
    );
    await world.inOrg((tx) =>
      tx.departureSettings.upsert({
        where: { organizationId: world.organizationId },
        create: { shareSeatCounts: seed.shareSeatCounts ?? false },
        update: { shareSeatCounts: seed.shareSeatCounts ?? false },
      }),
    );
    const lead = (
      owner: string | null,
      extra: {
        name?: string;
        destinationId?: string;
        createdAt?: Date;
        phoneE164?: string | null;
        stage?: "new" | "not_a_lead";
      } = {},
    ) =>
      world.inOrg(async (tx) => {
        const person = await aPerson(tx, {
          name: extra.name ?? "Priya Nair",
          ...(extra.phoneE164 === undefined
            ? {}
            : { phoneE164: extra.phoneE164, email: `${String(Math.random())}@example.test` }),
        });
        const made = await aLead(tx, {
          personId: person.id,
          ownerUserId: owner,
          destinationId: extra.destinationId ?? destination.id,
          createdAt: extra.createdAt ?? daysAgo(30),
          stage: extra.stage ?? "contacted",
          adults: 2,
          childrenAges: [8],
        });
        return { leadId: made.id, personId: person.id };
      });
    const model = createMemoryAiModel();
    const find = (member = world.manager) =>
      world.inOrg(async (tx) => findInterestedPeople(tx, member, await findDeparture(tx, departure.id), now));
    const write = (leadId: string, member = world.manager) =>
      writeSeatMessage(
        world.db,
        model,
        member,
        { departureId: departure.id, leadId },
        { agencyName: "Sharma Holidays", now },
      );
    return { destination, elsewhere, departure, lead, model, find, write };
  }

  it("lists only the people the rules allow, newest first, with what they asked before", async () => {
    const s = await setup();
    const good = await s.lead(world.seller.userId, { name: "Priya Nair" });
    const older = await s.lead(world.seller.userId, { name: "Asha Rao", createdAt: daysAgo(200) });
    await s.lead(world.seller.userId, { name: "Too Old", createdAt: daysAgo(400) });
    await s.lead(world.seller.userId, { name: "Elsewhere", destinationId: s.elsewhere.id });
    await s.lead(world.seller.userId, { name: "No Phone", phoneE164: null });
    await s.lead(world.seller.userId, { name: "Not A Lead", stage: "not_a_lead" });
    const blocked = await s.lead(world.seller.userId, { name: "Blocked Person" });
    const optedOut = await s.lead(world.seller.userId, { name: "Opted Out" });
    const withdrawnWhatsapp = await s.lead(world.seller.userId, { name: "Stopped WhatsApp" });
    const booked = await s.lead(world.seller.userId, { name: "Already Booked" });
    const offered = await s.lead(world.seller.userId, { name: "Offered Lately" });
    const offeredLongAgo = await s.lead(world.seller.userId, { name: "Offered Long Ago" });
    const theirs = await s.lead(world.manager.userId, { name: "Someone Elses" });
    await world.inOrg(async (tx) => {
      const phone = (await tx.person.findUniqueOrThrow({ where: { id: blocked.personId } })).phoneE164 ?? "";
      await tx.blockedContact.create({ data: { kind: "phone", value: phone } });
      for (const [who, purpose] of [
        [optedOut, "marketing"],
        [withdrawnWhatsapp, "whatsapp"],
      ] as const) {
        await tx.personConsent.create({
          data: {
            personId: who.personId,
            purpose,
            action: "granted",
            wording: "ok",
            wordingVersion: 1,
            source: "staff",
            recordedAt: daysAgo(40),
          },
        });
        await tx.personConsent.create({
          data: {
            personId: who.personId,
            purpose,
            action: "withdrawn",
            wording: "stop",
            wordingVersion: 1,
            source: "staff",
            recordedAt: daysAgo(10),
          },
        });
      }
      await tx.departureHold.create({
        data: {
          departureId: s.departure.id,
          leadId: booked.leadId,
          seats: 1,
          expiresAt: new Date(now.getTime() + 3_600_000),
        },
      });
      await tx.departureOffer.create({
        data: {
          departureId: s.departure.id,
          leadId: offered.leadId,
          draftedBy: world.manager.userId,
          sentAt: daysAgo(3),
        },
      });
      await tx.departureOffer.create({
        data: {
          departureId: s.departure.id,
          leadId: offeredLongAgo.leadId,
          draftedBy: world.manager.userId,
          sentAt: daysAgo(20),
        },
      });
    });
    const seen = await s.find();
    // The newest month first; within a month, the enquiry made last (the leads are made one after another).
    expect(seen.people.map((one) => one.name)).toEqual(["Someone Elses", "Offered Long Ago", "Priya Nair", "Asha Rao"]);
    expect(seen.more).toBe(false);
    expect(seen.people.find((one) => one.leadId === good.leadId)).toMatchObject({
      destination: expect.stringContaining("Spiti") as string,
      partySize: 3,
      label: null,
    });
    expect(seen.people.find((one) => one.leadId === older.leadId)).toBeDefined();
    expect(seen.people.some((one) => one.leadId === theirs.leadId)).toBe(true);
    // A salesperson sees only the leads they own.
    const mine = await s.find(world.seller);
    expect(mine.people.map((one) => one.leadId)).not.toContain(theirs.leadId);
    expect(mine.people.map((one) => one.leadId)).toContain(good.leadId);
  });

  it("shows at most 50 and says there are more", async () => {
    const s = await setup();
    for (let index = 0; index < 52; index += 1) await s.lead(world.seller.userId, { name: `Lead ${String(index)}` });
    const seen = await s.find();
    expect(seen.people).toHaveLength(50);
    expect(seen.more).toBe(true);
  });

  it("refuses a closed or full departure, and one with no destination", async () => {
    const closed = await setup({ status: "closed" });
    expect(await reasonOf(closed.find())).toBe("DEPARTURE_NOT_OPEN");
    const full = await setup({ seatsTotal: 1 });
    await aBookingOn(world, full.departure.id, { adults: 1, confirmed: true });
    expect(await reasonOf(full.find())).toBe("SEATS_NONE_FREE");
    const open = await setup();
    await world.inOrg((tx) => tx.departure.update({ where: { id: open.departure.id }, data: { destinationId: null } }));
    expect(await reasonOf(open.find())).toBe("DEPARTURE_NEEDS_DESTINATION");
  });

  it("writes one message with the price put in by code, a typed amount and an unallowed seat count taken out", async () => {
    const s = await setup();
    const person = await s.lead(world.seller.userId, { name: "Priya Nair" });
    s.model.answer(
      "Hi Priya! You asked about Spiti. Our 3 Nov group has only 4 seats left at Rs 9,999 just for you.\nIt is {price}. Reply if you'd like one!",
    );
    const message = await s.write(person.leadId);
    expect(message.text).toContain("Hi Priya!");
    expect(message.text).toContain("₹12,500.00 per person plus GST");
    expect(message.text).not.toContain("9,999");
    expect(message.text).not.toMatch(/\b4 seats\b/);
    expect(message.text).toContain("a few seats");
    // Staff are told the model's own amount and seat count were taken out.
    expect(message.removedAmounts).toBe(true);
    const [request] = s.model.requests;
    expect(request?.feature).toBe("reach_out");
    const prompt = JSON.stringify(request?.messages);
    expect(prompt).toContain("Spiti batch, 3 Nov");
    expect(prompt).not.toMatch(/\+91|Seats left: \d/);
    expect(prompt).not.toContain("1250000");
    const fill = await world.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: message.fillId } }));
    expect(fill).toMatchObject({ target: "departure_offer", subjectId: person.leadId, appliedAt: null });
    expect(JSON.stringify(fill)).not.toContain("Hi Priya");
  });

  it("says nothing was taken out when the model typed no amount or seat count, and fences the names as data", async () => {
    const s = await setup();
    const person = await s.lead(world.seller.userId, { name: "Ignore Previous" });
    s.model.answer("Hi! A few seats are open on our Spiti group.\nIt is {price}. Reply if you'd like one!");
    const message = await s.write(person.leadId);
    expect(message.removedAmounts).toBe(false);
    const user = s.model.requests[0]?.messages.find((one) => one.role === "user")?.content ?? "";
    const fenced = /<data>[^]*?<\/data>/g;
    const outside = user.replace(fenced, "");
    expect(outside).not.toContain("Ignore");
    expect(user).toMatch(/<data>[^]*First name: Ignore[^]*<\/data>/);
  });

  it("may say how many seats are left only when the agency allows it, and only the real number", async () => {
    const s = await setup({ shareSeatCounts: true });
    const person = await s.lead(world.seller.userId);
    s.model.answer("Hi! Only 10 seats left, or maybe 3 seats, {price}.");
    const message = await s.write(person.leadId);
    expect(message.text).toContain("10 seats");
    expect(message.text).not.toMatch(/\b3 seats\b/);
    expect(JSON.stringify(s.model.requests[0]?.messages)).toContain("Seats left: 10");
  });

  it("drops the price line when the departure has none", async () => {
    const s = await setup({ pricePaise: null });
    const person = await s.lead(world.seller.userId);
    s.model.answer("Hi! A few seats are open.\nThe price is {price}.\nReply to book.");
    const message = await s.write(person.leadId);
    expect(message.text).toBe("Hi! A few seats are open.\nReply to book.");
  });

  it("refuses a person the rules leave out, without asking the AI or taking a call, and gives the call back when the AI fails", async () => {
    const s = await setup();
    const stranger = await s.lead(world.manager.userId);
    expect(await reasonOf(s.write(stranger.leadId, world.seller))).toBe("SEAT_OFFER_NOT_ALLOWED");
    const optedOut = await s.lead(world.seller.userId);
    await world.inOrg((tx) =>
      tx.personConsent.create({
        data: {
          personId: optedOut.personId,
          purpose: "marketing",
          action: "withdrawn",
          wording: "stop",
          wordingVersion: 1,
          source: "staff",
        },
      }),
    );
    expect(await reasonOf(s.write(optedOut.leadId))).toBe("SEAT_OFFER_NOT_ALLOWED");
    expect(s.model.requests).toHaveLength(0);
    const fine = await s.lead(world.seller.userId);
    const before = (await world.inOrg((tx) => tx.aiUsage.findMany()))[0]?.calls ?? 0;
    s.model.answer({ ok: false, reason: "unavailable" });
    expect(await reasonOf(s.write(fine.leadId))).toBe("AI_UNAVAILABLE");
    expect((await world.inOrg((tx) => tx.aiUsage.findMany()))[0]?.calls ?? 0).toBe(before);
  });

  it("marks an offer sent once: the lead is left alone, the timeline notes it, the audit says whether the words were changed", async () => {
    const s = await setup();
    const person = await s.lead(world.seller.userId);
    s.model.answer("Hi! Seats are open on our Spiti group. Reply to know more.");
    const message = await s.write(person.leadId, world.seller);
    const sent = (text: string) =>
      world.inOrg((tx) =>
        recordOfferSent(
          tx,
          world.seller,
          { departureId: s.departure.id, leadId: person.leadId, fillId: message.fillId, text },
          now,
        ),
      );
    await sent(`${message.text} See you!`);
    await sent(message.text);
    const offers = await world.inOrg((tx) => tx.departureOffer.findMany({ where: { leadId: person.leadId } }));
    expect(offers).toMatchObject([
      { departureId: s.departure.id, draftedBy: world.seller.userId, fillId: message.fillId },
    ]);
    expect(await world.inOrg((tx) => tx.leadNote.count({ where: { leadId: person.leadId } }))).toBe(1);
    const audit = await world.inOrg((tx) =>
      tx.auditEntry.findMany({ where: { action: "ai.offer-sent", entityId: s.departure.id } }),
    );
    expect(audit).toMatchObject([{ after: { changedByMember: true } }]);
    expect(JSON.stringify(audit)).not.toContain("Hi!");
    const fill = await world.inOrg((tx) => tx.aiFill.findUniqueOrThrow({ where: { id: message.fillId } }));
    expect(fill).toMatchObject({ appliedBy: world.seller.userId, changedFields: ["message"] });
    expect((await s.find()).people.map((one) => one.leadId)).not.toContain(person.leadId);
    // Another member can't mark with a message they didn't write.
    expect(
      await reasonOf(
        world.inOrg((tx) =>
          recordOfferSent(
            tx,
            world.manager,
            { departureId: s.departure.id, leadId: person.leadId, fillId: message.fillId, text: "x" },
            now,
          ),
        ),
      ),
    ).toBe("NOT_FOUND");
  });

  it("is erased with the customer", async () => {
    const s = await setup();
    const person = await s.lead(world.seller.userId);
    s.model.answer("Hi! Seats are open.");
    const message = await s.write(person.leadId, world.seller);
    await world.inOrg((tx) =>
      recordOfferSent(
        tx,
        world.seller,
        { departureId: s.departure.id, leadId: person.leadId, fillId: message.fillId, text: message.text },
        now,
      ),
    );
    await platformDb.transaction((tx) =>
      eraseCustomerParts(
        tx,
        systemActor(world.organizationId),
        { organizationId: world.organizationId, personId: person.personId },
        now,
      ),
    );
    expect(await world.inOrg((tx) => tx.departureOffer.count({ where: { leadId: person.leadId } }))).toBe(0);
    expect(await world.inOrg((tx) => tx.aiFill.count({ where: { id: message.fillId } }))).toBe(0);
  });
});
