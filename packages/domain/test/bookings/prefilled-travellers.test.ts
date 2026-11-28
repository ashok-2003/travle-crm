// Travellers start from the lead's person (bookings revamp): traveller 1 takes the person's name and phone on every path that
// makes a booking and is marked pre-filled; a person without a phone gives the name alone; any save by a person (staff one at
// a time, staff applying the AI's fill, the traveller on the trip page) clears the marks; the other travellers stay empty.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  confirmBooking,
  getBooking,
  linkAiBooking,
  quoteAcceptedListener,
  saveTravellerByStaff,
  saveTravellerFromLink,
  saveTravellersByStaff,
  setTravellerCount,
  createBookingFromQuote,
} from "../../src/bookings/index.js";
import type { DomainEvent } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { recordPayment } from "../../src/quotes/index.js";
import { aBooking, aQuote, openWorld, type World } from "./support.js";

const now = new Date("2026-10-29T06:30:00Z");
const details = (travellerId: string, name = "Meera Iyer") => ({
  travellerId,
  name,
  dateOfBirth: "1988-06-14",
  gender: "female" as const,
  phone: "+919876500002",
  emergencyName: "",
  emergencyPhone: "",
  medicalNotes: "",
  roomRequest: "none" as const,
  roomNote: "",
  identity: null,
});

describe("travellers pre-filled from the lead", () => {
  let world: World;
  beforeAll(async () => {
    world = await openWorld("Prefilled travellers");
  });
  afterAll(async () => {
    await world.close();
  });

  const rowsOf = (bookingId: string) =>
    world.inOrg((tx) => tx.bookingTraveller.findMany({ where: { bookingId }, orderBy: { position: "asc" } }));
  const personOf = (leadId: string) =>
    world.inOrg(async (tx) => {
      const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId }, select: { person: true } });
      return lead.person;
    });

  it("fills traveller 1 from the person on an accepted quote, and leaves the others empty", async () => {
    const { bookingId, leadId } = await aBooking(world, { adults: 2, children: 1 });
    const person = await personOf(leadId);
    const rows = await rowsOf(bookingId);
    expect(rows[0]).toMatchObject({ name: person.name, phone: person.phoneE164, prefilledFields: ["name", "phone"] });
    expect(rows.slice(1).map((row) => [row.name, row.phone, row.prefilledFields])).toEqual([
      ["", "", []],
      ["", "", []],
    ]);
    const shown = await world.inOrg((tx) => getBooking(tx, world.seller, bookingId));
    expect(shown.travellers.map((one) => one.prefilled)).toEqual([["name", "phone"], [], []]);
  });

  it("gives the name alone when the person has no phone", async () => {
    const { quote, lead } = await world.inOrg((tx) => aQuote(tx, { ownerUserId: world.seller.userId }));
    await world.inOrg((tx) =>
      tx.person.update({ where: { id: lead.personId }, data: { phoneE164: null, email: "meera@example.test" } }),
    );
    const bookingId = await world.inOrg((tx) =>
      createBookingFromQuote(tx, { organizationId: world.organizationId, quoteId: quote.id, confirmed: false }, now),
    );
    const [first] = await rowsOf(bookingId ?? "");
    expect(first).toMatchObject({ phone: "", prefilledFields: ["name"] });
  });

  it("fills it on the path the AI takes", async () => {
    const { lead } = await world.inOrg((tx) => aQuote(tx, { ownerUserId: world.seller.userId, status: "sent" }));
    const bookingId = await world.inOrg((tx) =>
      linkAiBooking(
        tx,
        systemActor(world.organizationId),
        {
          leadId: lead.id,
          summary: "Manali 5N for 2",
          details: { package: "", dates: "", travellers: "2", pickup: "", amountPaise: 4_000_000 },
          proofMessageIds: [],
          linkedBookingId: null,
        },
        now,
      ),
    );
    const person = await personOf(lead.id);
    const [first] = await rowsOf(bookingId);
    expect(first).toMatchObject({ name: person.name, prefilledFields: ["name", "phone"] });
  });

  it("fills it on the path a payment on a sent quote takes", async () => {
    const { quote, lead } = await world.inOrg((tx) =>
      aQuote(tx, { ownerUserId: world.seller.userId, status: "sent", totalPaise: 100_000_00 }),
    );
    await world.inOrg((tx) =>
      recordPayment(
        tx,
        world.accounts,
        {
          quoteId: quote.id,
          amountPaise: 30_000_00,
          receivedOn: "2026-10-29",
          method: "upi",
          reference: "UTR",
          requestId: crypto.randomUUID(),
        },
        now,
      ),
    );
    const accepted = await world.inOrg((tx) => tx.outboxEvent.findMany({ where: { type: "quote.accepted" } }));
    const mine = accepted.find((one) => (one.payload as { quoteId?: string }).quoteId === quote.id);
    const event: DomainEvent = {
      id: crypto.randomUUID(),
      organizationId: world.organizationId,
      type: "quote.accepted",
      payload: { quoteId: quote.id, leadId: lead.id, confirmed: true },
      occurredAt: now,
    };
    expect(mine).toBeDefined();
    await quoteAcceptedListener().handle(event, {
      actor: systemActor(world.organizationId),
      forOrg: (work) => world.inOrg(work),
    });
    const booking = await world.inOrg((tx) => tx.booking.findFirstOrThrow({ where: { quoteId: quote.id } }));
    const [first] = await rowsOf(booking.id);
    expect(first?.prefilledFields).toEqual(["name", "phone"]);
  });

  it("clears the marks when staff save the traveller, and only that traveller's", async () => {
    const { bookingId } = await aBooking(world, { adults: 2 });
    const [first, second] = await rowsOf(bookingId);
    await world.inOrg((tx) => saveTravellerByStaff(tx, world.seller, details(first?.id ?? ""), now));
    const after = await rowsOf(bookingId);
    expect(after.map((row) => row.prefilledFields)).toEqual([[], []]);
    expect(second?.prefilledFields).toEqual([]);
  });

  it("clears them when staff apply the AI's fill (the applied save is the person's), but not before", async () => {
    const { bookingId } = await aBooking(world, { adults: 1 });
    const [first] = await rowsOf(bookingId);
    expect(first?.prefilledFields).toEqual(["name", "phone"]);
    await world.inOrg((tx) =>
      saveTravellersByStaff(
        tx,
        world.seller,
        { bookingId, travellers: [{ travellerId: first?.id ?? "", name: "Meera Iyer" }] },
        now,
      ),
    );
    expect((await rowsOf(bookingId))[0]?.prefilledFields).toEqual([]);
  });

  it("clears them when the traveller saves on the trip page", async () => {
    const { bookingId, quoteId } = await aBooking(world, { adults: 1 });
    await world.inOrg((tx) => confirmBooking(tx, world.seller, { bookingId }, now));
    const [first] = await rowsOf(bookingId);
    await world.inOrg((tx) =>
      saveTravellerFromLink(
        tx,
        {
          organizationId: world.organizationId,
          quoteId,
          traveller: { ...details(first?.id ?? ""), idPhotoAttachmentId: null },
        },
        now,
      ),
    );
    expect((await rowsOf(bookingId))[0]?.prefilledFields).toEqual([]);
  });

  it("leaves rows added later, and bookings made before, empty", async () => {
    const { bookingId } = await aBooking(world, { adults: 1 });
    await world.inOrg((tx) => setTravellerCount(tx, world.seller, { bookingId, count: 3 }));
    expect((await rowsOf(bookingId)).map((row) => row.prefilledFields)).toEqual([["name", "phone"], [], []]);
  });
});
