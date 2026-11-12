// Where a lite sale stands, the sales checklist's next question (K1-K3), and which names are worth calling someone by.
import { liteFacts, type LiteFacts } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { nextItem, saleStageOf, usableName } from "../../../src/ai/lite/decide/stage.js";
import type { SituationPackage } from "../../../src/ai/lite/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const P1 = "01900000-0000-7000-8000-000000000001";
const D1 = "01900000-0000-7000-8000-0000000000d1";
const PHONE = "+919876543210";
const pkg: SituationPackage = {
  id: P1,
  title: "Kedarnath Yatra 4N",
  place: "Kedarnath",
  destinationId: null,
  nights: 4,
  startCity: "Delhi",
  pickups: ["Delhi - Kashmiri Gate, 9 pm", "Haridwar - Railway station, 5 am"],
  offered: ["double", "triple", "child_bed"],
  adultRooms: ["double", "triple"],
  departures: [{ id: D1, startsOn: parseCalendarDate("2026-11-14"), freeSeats: 12 }],
};
const onePickupOneRoom: SituationPackage = { ...pkg, pickups: ["Delhi"], adultRooms: ["double"] };
const facts = (over: Partial<LiteFacts> = {}): LiteFacts => ({ ...liteFacts.parse({ agent: "lite" }), ...over });
const quote = { departureId: D1, totalPaise: 1_199_800, advancePaise: 400_000 };

describe("usableName", () => {
  it("takes a real name in any script, and nothing that only looks like one", () => {
    expect(usableName("Riya Sharma", PHONE)).toBe(true);
    expect(usableName("राहुल शर्मा", PHONE)).toBe(true);
    expect(usableName("D'Souza-Mehta", PHONE)).toBe(true);
    expect(usableName("WhatsApp +91 98765 43210", PHONE)).toBe(false);
    expect(usableName("🙂", PHONE)).toBe(false);
    expect(usableName("Travel", PHONE)).toBe(false);
    expect(usableName("mom", PHONE)).toBe(false);
    expect(usableName("Rahul123", PHONE)).toBe(false);
    expect(usableName("R", PHONE)).toBe(false);
    expect(usableName("Riya Rani Devi Sharma Kumari", PHONE)).toBe(false);
    expect(usableName(null, PHONE)).toBe(false);
  });
});

describe("nextItem", () => {
  it("asks in the checklist's order, only what the facts don't hold", () => {
    expect(nextItem(facts(), null, false, false)).toBe("name");
    expect(nextItem(facts(), null, true, false)).toBe("where");
    expect(nextItem(facts({ packageId: P1 }), pkg, true, false)).toBe("when");
    expect(nextItem(facts({ packageId: P1, departureId: D1 }), pkg, true, false)).toBe("people");
    const people = { packageId: P1, departureId: D1, adults: 2 };
    expect(nextItem(facts({ ...people, children: { count: 2, ages: [8] } }), pkg, true, false)).toBe("children_ages");
    expect(nextItem(facts(people), pkg, true, false)).toBe("pickup");
    expect(nextItem(facts({ ...people, pickupCity: "Delhi" }), pkg, true, false)).toBe("room");
    expect(nextItem(facts({ ...people, pickupCity: "Delhi", roomType: "double" }), pkg, true, false)).toBeNull();
  });

  it("a name given or skipped is not asked, and a one-word name is asked in full at booking, once", () => {
    const known = { packageId: P1, departureId: D1, adults: 2 };
    expect(nextItem(facts({ name: "Riya" }), null, false, false)).toBe("where");
    expect(nextItem(facts({ nameSkipped: true }), null, false, false)).toBe("where");
    expect(nextItem(facts({ ...known, name: "Riya" }), onePickupOneRoom, true, true)).toBe("full_name");
    expect(nextItem(facts({ ...known, name: "Riya" }), onePickupOneRoom, true, false)).toBeNull();
    expect(nextItem(facts({ ...known, name: "Riya", fullNameAsked: true }), onePickupOneRoom, true, true)).toBeNull();
    expect(nextItem(facts({ ...known, name: "Riya Sharma" }), onePickupOneRoom, true, true)).toBeNull();
  });

  it("pickup and room are asked only when the package offers a choice (K2)", () => {
    const known = facts({ packageId: P1, departureId: D1, adults: 2 });
    expect(nextItem(known, onePickupOneRoom, true, false)).toBeNull();
  });
});

describe("saleStageOf", () => {
  it("reads the booking first, then the quote, then the details", () => {
    const awaiting = { id: "b", status: "awaiting_payment" as const, expectedPaise: 400_000 };
    expect(saleStageOf(facts(), { ...awaiting, status: "proof_received" }, null)).toBe("payment_to_check");
    expect(saleStageOf(facts(), awaiting, null)).toBe("waiting_for_payment");
    expect(saleStageOf(facts({ packageId: P1, departureId: D1, quoted: quote }), null, pkg)).toBe("quoted");
    const complete = { packageId: P1, departureId: D1, adults: 2, pickupCity: "Delhi", roomType: "double" as const };
    expect(saleStageOf(facts(complete), null, pkg)).toBe("details_complete");
    expect(saleStageOf(facts({ ...complete, roomType: null }), null, pkg)).toBe("package_picked");
    expect(saleStageOf(facts(), null, null)).toBe("exploring");
  });

  it("a quote for another departure is no quote", () => {
    const moved = facts({ packageId: P1, departureId: null, quoted: quote });
    expect(saleStageOf(moved, null, pkg)).toBe("package_picked");
  });
});
