// checkReply: the last gate before a reply reaches a customer, as a table of what it refuses and what it lets through.
import { describe, expect, it } from "vitest";
import { chatFacts } from "@travel-crm/contracts/ai";
import { checkReply, type ReplyContext } from "../../../src/ai/lite/reply-check.js";
import type { Lookup } from "../../../src/ai/grounded/lookup.js";
import { replyContext } from "../../../src/ai/grounded/turn-write.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const manaliOnly: ReplyContext = {
  packagePlaces: ["manali"],
  customerPlaces: [],
  notRun: [],
  customTrips: false,
  knownPlaces: ["manali", "spiti", "kashmir"],
};
const kashmirNotRun = { ...manaliOnly, notRun: ["kashmir"] };

const reason = (text: string, context = manaliOnly, filled: { start: number; end: number }[] = []) => {
  const result = checkReply(text, filled, context);
  return result.ok ? "ok" : result.reason;
};

describe("checkReply", () => {
  it("refuses a typed amount, accepts the same through a placeholder", () => {
    expect(reason("Manali 5N6D December peak ₹7,999")).toBe("amount");
    const text = "Manali 5N6D December peak ₹7,999";
    const start = text.indexOf("₹");
    expect(reason(text, manaliOnly, [{ start, end: text.length }])).toBe("ok");
  });

  it("refuses a date outside the filled spans, and one only partly inside", () => {
    expect(reason("We leave on 14 Nov")).toBe("date");
    expect(reason("We leave on 14 Nov", manaliOnly, [{ start: 12, end: 15 }])).toBe("date");
    expect(reason("We leave on 14 Nov", manaliOnly, [{ start: 12, end: 18 }])).toBe("ok");
  });

  it.each([
    ["Spiti is lovely", "place"],
    ["Try SPITI VALLEY in June", "place"],
    ["Himachal Pradesh is lovely", "place"],
    ["Manali is lovely", "ok"],
    ["I scored a goal", "ok"],
    ["Goa-like beaches? No, mountains in Manali", "place"],
  ])("places: %s", (text, expected) => {
    expect(reason(text)).toBe(expected);
  });

  it("matches a multi-word place as a whole", () => {
    const context = { ...manaliOnly, packagePlaces: ["spiti valley"], knownPlaces: ["spiti valley"] };
    expect(reason("Spiti Valley is open", context)).toBe("ok");
    expect(reason("Himachal Pradesh is open", context)).toBe("place");
  });

  it("lets a not-run place be named only with a not-run phrase", () => {
    expect(reason("We don't run Kashmir, but our Manali trip is great", kashmirNotRun)).toBe("ok");
    expect(reason("Kashmir is lovely in December", kashmirNotRun)).toBe("place");
    expect(reason("Hum Kashmir nahi karate, Manali karate hain", kashmirNotRun)).toBe("ok");
    expect(reason("We do run Manali. We don't operate Kashmir.", kashmirNotRun)).toBe("ok");
  });

  it("lets the customer's own places through: their pickup city and the places they named (M2)", () => {
    const delhiStart = {
      ...manaliOnly,
      packagePlaces: ["manali", "delhi"],
      knownPlaces: ["manali", "delhi", "mumbai"],
    };
    const text = "From Mumbai you'll join us in Delhi for Manali.";
    expect(reason(text, delhiStart)).toBe("place");
    expect(reason(text, { ...delhiStart, customerPlaces: ["Mumbai"] })).toBe("ok");
    // A place the agency doesn't run still needs its not-run phrase, whoever named it.
    expect(reason("Kashmir is lovely", { ...kashmirNotRun, customerPlaces: ["Mumbai"] })).toBe("place");
  });

  it("builds the check's context with the chat's pickup city and place words", () => {
    const lookup: Lookup = {
      packages: [],
      notRun: ["Kashmir"],
      customTrips: false,
      today: parseCalendarDate("2026-11-06"),
      travellers: null,
      startsOn: null,
    };
    const facts = chatFacts.parse({
      pickupCity: "Mumbai",
      places: [{ destinationId: null, words: "Lonavala" }],
      notRun: ["Kashmir"],
    });
    const context = replyContext(lookup, ["Manali"], facts);
    expect(context.customerPlaces).toEqual(["Mumbai", "Lonavala"]);
    expect(context.notRun).toEqual(["Kashmir"]);
  });

  it("never lets a reply say it doesn't run a place named in another script (M6)", () => {
    const hindi = { ...manaliOnly, notRun: ["मनाली"] };
    expect(reason("We don't run मनाली, sorry.", hindi)).toBe("place");
    expect(reason("हम मनाली नहीं करते", hindi)).toBe("place");
  });

  it("lets a custom-trip phrase stand in only when custom trips are on", () => {
    const text = "Kashmir: the team will send a quote for a custom trip";
    expect(reason(text, kashmirNotRun)).toBe("place");
    expect(reason(text, { ...kashmirNotRun, customTrips: true })).toBe("ok");
  });

  it.each([
    "we have received your ₹4,000",
    "Payment received, thank you",
    "Your booking is confirmed!",
    "seats confirmed for you",
    "Aapka payment mil gaya hai",
    "booking confirm ho gayi",
    "आपका पेमेंट मिल गया है",
    "बुकिंग कन्फर्म हो गई",
    "4000 mil gaya",
  ])("payment claim: %s", (text) => {
    expect(reason(text)).toBe("payment_claim");
  });

  it.each([
    "To confirm your booking, please pay the advance",
    "We have not received your payment yet",
    "I'll let you know once payment is received",
    "Have you made the payment?",
    "Send a screenshot after payment",
    "Do you want to get your booking confirmed?",
    "we received your message",
  ])("not a payment claim: %s", (text) => {
    expect(reason(text)).toBe("ok");
  });

  it.each([
    "the team gave me the pricing",
    "The team said it's fine",
    "as discussed with the team",
    "team ne bataya hai",
    "टीम ने बताया है",
    "The team has already approved this",
  ])("team claim: %s", (text) => {
    expect(reason(text)).toBe("team_claim");
  });

  it.each([
    "The team will confirm",
    "the team will send you a quote",
    "our team will call you",
    "Team will check and tell you tomorrow",
  ])("allowed about the team: %s", (text) => {
    expect(reason(text)).toBe("ok");
  });

  it("holds the numbers that are not money or dates", () => {
    for (const text of [
      "Manali 5N6D",
      "2 adults",
      "Altitude 4,500 ft",
      "Day 3 local sightseeing",
      "Pickup: call +91 98765 43210",
    ]) {
      expect(reason(text)).toBe("ok");
    }
  });

  it.each([
    "Pay the advance to UPI sampletrips@ybl",
    "a/c 50100234567890, IFSC HDFC0001234",
    "Pay here: https://rzp.io/l/manali",
    "Scan or pay at upi://pay?pa=trails@okhdfcbank",
  ])("payment detail the model typed: %s", (text) => {
    expect(reason(text)).toBe("payment_detail");
  });

  it("lets an email address, a phone in a pickup line and code's own text through", () => {
    expect(reason("Mail asha@gmail.com and we will share the itinerary")).toBe("ok");
    expect(reason("Pickup: call +91 98765 43210")).toBe("ok");
    const text = "Pay to trails@ybl";
    expect(reason(text, manaliOnly, [{ start: text.indexOf("trails"), end: text.length }])).toBe("ok");
  });

  it("gives a short excerpt around the match", () => {
    const result = checkReply(`${"word ".repeat(40)}₹7,999 ${"word ".repeat(40)}`, [], manaliOnly);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.excerpt).toContain("₹7,999");
      expect(result.excerpt.length).toBeLessThanOrEqual(80);
    }
  });
});

describe("checkReply: a hedge excuses a claim only when it governs it (P4-21)", () => {
  it.each([
    "Payment received, will share details",
    "Booking confirmed, we will send tickets",
    "Your seats are confirmed, you can pay the balance later",
    "Payment received, can you share your PAN?",
    "Payment received if any doubt ask",
    "We've received the advance",
    "I received the advance",
    "Payment of 4000 is received",
    "Payment has reached us",
    "Amount credited, thanks",
    "Your slot is locked",
    "We have received the money",
    "UPI transfer came through",
    "Your tour is booked",
    "Hum ne aapka advance receive kar liya",
    "payment aa gaya",
    "paise mil gaye",
    "booking ho gayi",
    "The team has confirmed your seats, will share details",
  ])("refused: %s", (text) => {
    expect(reason(text)).toMatch(/payment_claim|team_claim/);
  });

  it.each([
    "Once we receive your payment, the team will confirm your seats",
    "Your seats will be confirmed once payment is received",
    "We will confirm your booking after the advance",
    "Payment will be received at the office",
    "I'll confirm as soon as the advance is received",
    "We haven't received the advance yet",
    "Payment not received yet",
    "Have you made the payment?",
    "Have you received the payment?",
    "The team will check your payment",
    "Once the team confirms the payment, we will share tickets",
    "If the advance is received we can book",
    "We can confirm your booking once paid",
    "Share a screenshot after payment",
  ])("allowed: %s", (text) => {
    expect(reason(text)).toBe("ok");
  });

  it("holds the place leniency for a multi-word package place", () => {
    const valley = { ...manaliOnly, packagePlaces: ["spiti valley"] };
    expect(reason("Spiti is open in June", valley)).toBe("ok");
    expect(reason("Spiti is open in June", manaliOnly)).toBe("place");
  });
});

describe("checkReply: the booking flow's own sentences (P4-24)", () => {
  it.each([
    "Your booking is confirmed",
    "Your booking's confirmed!",
    "Booking confirmed \u{1F389}",
    "Your booking has been confirmed",
    "If you have any doubt, ask; payment received",
    "Advance can be received then payment received",
  ])("refused: %s", (text) => {
    expect(reason(text)).toBe("payment_claim");
  });

  it.each([
    "To get your booking confirmed, pay the advance",
    "To confirm your booking, please pay the advance",
    "Your seats will be confirmed once the team checks your payment",
    "Seats get confirmed after the advance is received",
    "Once you pay, the team will confirm your booking",
    "Please share the payment screenshot and the team will check it",
    "Your booking can be confirmed after the advance",
    "Seats to be confirmed after payment",
    "We'll confirm your booking soon",
  ])("allowed: %s", (text) => {
    expect(reason(text)).toBe("ok");
  });

  it("lets the advance's amount stand when code wrote it", () => {
    const text = "To get your booking confirmed, pay the advance of ₹12,000";
    expect(reason(text, manaliOnly, [{ start: text.indexOf("₹"), end: text.length }])).toBe("ok");
  });

  it("examines every team claim in a clause", () => {
    expect(reason("Team will say the team said it is fine")).toBe("team_claim");
  });
});

describe("checkReply: wishes and gaps (P4-25)", () => {
  it.each([
    "We are happy to say booking confirmed",
    "We have your booking confirmed",
    "We have your booking confirmed, thanks",
    "Payment gets received",
    "Your payment went through",
    "We have your payment",
    "Thanks for the payment, it has been received",
    "Thanks for the advance, it is credited",
  ])("refused: %s", (text) => {
    expect(reason(text)).toBe("payment_claim");
  });

  it.each([
    "We'd love to get your booking confirmed \u2014 shall I share the payment details?",
    "Want to get your seats confirmed? The advance is ",
    "The team needs to see your screenshot to confirm the payment",
    "Thanks, we've received your details",
    "We have received it",
    "We want to help you get your seats confirmed",
    "Seats get confirmed after the advance is received",
    "It is received well by travellers",
  ])("allowed: %s", (text) => {
    expect(reason(text)).toBe("ok");
  });
});
