// amountsAndDatesIn: what counts as money or a date in a reply, and the numbers that must never count.
import { describe, expect, it } from "vitest";
import {
  amountsAndDatesIn,
  indianTravelPlaces,
  paymentClaimPhrases,
  teamClaimPhrases,
  notRunPhrases,
  customTripPhrases,
  withoutAmountsAndDates,
} from "../../src/ai/reply-words.js";

const kinds = (text: string) => amountsAndDatesIn(text).map((m) => `${m.kind}:${text.slice(m.start, m.end)}`);

describe("amountsAndDatesIn", () => {
  it.each([
    ["Rs 6999/- only", "money:Rs 6999/-"],
    ["₹7,999 per person", "money:₹7,999"],
    ["Rs. 12,500", "money:Rs. 12,500"],
    ["INR 45000", "money:INR 45000"],
    ["about 7000 rupees", "money:7000 rupees"],
    ["roughly 7.5k", "money:7.5k"],
    ["around 1.2 lakh", "money:1.2 lakh"],
    ["budget 2L", "money:2L"],
    ["price is 7,999 per head", "money:7,999"],
    ["total 15000", "money:15000"],
    ["advance of 5000 to book", "money:5000"],
    ["₹1,20,000", "money:₹1,20,000"],
  ])("money: %s", (text, expected) => {
    expect(kinds(text)).toContain(expected);
  });

  it.each([
    ["14 Nov", "date:14 Nov"],
    ["Nov 14", "date:Nov 14"],
    ["14th November 2026", "date:14th November 2026"],
    ["14/11", "date:14/11"],
    ["14-11-2026", "date:14-11-2026"],
    ["Saturday 14th", "date:Saturday 14th"],
    ["kal 14 ko", "date:kal 14 ko"],
    ["this Saturday", "date:this Saturday"],
    ["next Friday", "date:next Friday"],
    ["coming Sunday", "date:coming Sunday"],
    ["tomorrow 15", "date:tomorrow 15"],
    ["on 14.11.2026", "date:14.11.2026"],
    ["Jan 2027", "date:Jan 2027"],
    ["in January 2027", "date:January 2027"],
  ])("date: %s", (text, expected) => {
    expect(kinds(text)).toContain(expected);
  });

  it.each([
    "Manali 5N6D",
    "5 nights 6 days",
    "Day 3 is local sightseeing",
    "2 adults and 1 child",
    "4,500 ft altitude",
    "reach 12000 ft",
    "+91 98765 43210",
    "pickup call 9876543210 booking",
    "call +91 98765 43210 for the booking",
    "We run trips in December",
    "I'll check and tell you tomorrow",
    "see you on Saturday",
    "kal baat karte hain",
    "Dec 5 nights package",
    "2-3 days",
    "available 24/7",
    "group of 12 people",
    "tomorrow 2 adults",
    "Saturday 5 pm",
    "Room 204",
    "package 2026",
    "only 2026",
    "booking for 2026",
    "rate 7.5 per km",
  ])("not a match: %s", (text) => {
    expect(amountsAndDatesIn(text)).toEqual([]);
  });

  it("withoutAmountsAndDates removes every span", () => {
    expect(withoutAmountsAndDates("Manali 14 Nov for ₹7,999 only")).toBe("Manali for only");
  });
});

describe("word lists", () => {
  it("are lowercase, large and in three languages", () => {
    expect(indianTravelPlaces.length).toBeGreaterThanOrEqual(140);
    for (const place of indianTravelPlaces) expect(place).toBe(place.toLowerCase());
    expect(indianTravelPlaces).toEqual(expect.arrayContaining(["manali", "spiti valley", "himachal pradesh", "goa"]));
    for (const list of [paymentClaimPhrases, teamClaimPhrases, notRunPhrases, customTripPhrases]) {
      expect(list.some((p) => /[ऀ-ॿ]/.test(p))).toBe(true);
    }
  });
});
