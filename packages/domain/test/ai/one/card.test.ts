// The offer card's text, its two buttons and the reading of a tap: code's words from the offer record, within WhatsApp's limits.
import type { LiveOffer } from "@travel-crm/contracts/ai";
import { BUTTON_LIMITS } from "@travel-crm/integrations/whatsapp";
import { describe, expect, it } from "vitest";
import { BOOK_TITLE, CHANGE_TITLE, offerButtons, offerCardBody, tapOf } from "../../../src/ai/one/card.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { kedarkantha } from "../natural/fixtures.js";

const offerId = "0194f5a0-0000-7000-8000-000000000001";
const sheets = [{ ...kedarkantha, packageId: "package-1", startCity: "Dehradun" }];
const offer: LiveOffer = {
  id: offerId,
  packageId: "package-1",
  startsOn: "2026-12-19",
  adults: 2,
  childrenAges: [8],
  room: "double",
  payInFull: false,
  departureId: "departure-1",
  totalPaise: 2_260_000,
  advancePaise: 560_000,
  at: "2026-11-14T10:00:00.000Z",
};
const today = parseCalendarDate("2026-11-14");

describe("the offer card", () => {
  it("writes the card from the offer: trip, day, party, room, start city, total and advance", () => {
    expect(offerCardBody(offer, sheets, today)).toBe(
      "*Kedarkantha Trek*\nSat 19 Dec · 2 adults, 1 child (8) · Double room\nFrom Dehradun\nTotal ₹22,600 · ₹5,600 advance now",
    );
    expect(offerCardBody({ ...offer, payInFull: true, room: null }, sheets, today)).toBe(
      "*Kedarkantha Trek*\nSat 19 Dec · 2 adults, 1 child (8)\nFrom Dehradun\nTotal ₹22,600, all now",
    );
  });

  it("cuts a long title so the body stays within 1,024 characters", () => {
    const long = [{ ...kedarkantha, packageId: "package-1", title: "K".repeat(3000), startCity: "D".repeat(3000) }];
    const body = offerCardBody(offer, long, today);
    expect(body.length).toBeLessThanOrEqual(BUTTON_LIMITS.body);
    expect(body).toContain("Total ₹22,600");
    expect(offerButtons(offerId).map((button) => button.title.length <= BUTTON_LIMITS.title)).toEqual([true, true]);
  });

  it("reads book and change taps, and nothing from other ids", () => {
    expect(offerButtons(offerId)).toEqual([
      { id: `book:${offerId}`, title: BOOK_TITLE },
      { id: `change:${offerId}`, title: CHANGE_TITLE },
    ]);
    expect(tapOf(`book:${offerId}`)).toEqual({ button: "book", offerId });
    expect(tapOf(`change:${offerId}`)).toEqual({ button: "change", offerId });
    for (const other of [null, "", "book:", "book:nope", `pay:${offerId}`, `Book:${offerId}`, `book:${offerId} `]) {
      expect(tapOf(other)).toBeNull();
    }
  });
});
