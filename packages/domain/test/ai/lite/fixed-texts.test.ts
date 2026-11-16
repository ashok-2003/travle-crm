// The fixed texts: every key in every language passes the reply check, scripts are right, slots are enforced.
import { liteLanguages, paymentClaimPhrases, teamClaimPhrases, type LiteLanguage } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { checkReply } from "../../../src/ai/lite/reply-check.js";
import { hasPhrase } from "../../../src/ai/lite/phrase-match.js";
import { fixedTextTable } from "../../../src/ai/lite/fixed-text-table.js";
import { fixedText, holdUntilWords, roomWords, travellersWords } from "../../../src/ai/lite/fixed-texts.js";
import type { FixedTextKey } from "../../../src/ai/lite/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const keys = Object.keys(fixedTextTable) as FixedTextKey[];
const samples: Record<string, string> = {
  package: "Kedarnath Yatra",
  from: "₹5,999",
  date: "Sat 14 Nov",
  perPerson: "₹7,500",
  room: "double sharing",
  travellers: "3 adults, 1 child",
  total: "₹30,000",
  advance: "₹8,000",
  amount: "₹8,000",
  seats: "4",
  holdUntil: "Mon 16 Nov, 6 pm",
  agency: "Hills Travel",
  place: "Goa",
};
const context = {
  packagePlaces: ["Kedarnath"],
  customerPlaces: [],
  notRun: ["Goa"],
  knownPlaces: ["Kedarnath", "Goa"],
};
const slotsOf = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "");

describe("the fixed texts", () => {
  it("every fixed text, in every language, passes the reply check", () => {
    for (const key of keys) {
      for (const language of liteLanguages) {
        const { text, filled } = fixedText(key, language, samples);
        expect(checkReply(text, filled, context), `${key} ${language}`).toEqual({ ok: true });
        expect(hasPhrase(text, paymentClaimPhrases), `${key} ${language} payment claim`).toBe(false);
        expect(hasPhrase(text, teamClaimPhrases), `${key} ${language} team claim`).toBe(false);
      }
    }
  });

  it("the Hindi texts are Devanagari and the Hinglish Latin", () => {
    for (const key of keys) {
      const outside = (language: LiteLanguage) => fixedTextTable[key][language].replace(/\{\w+\}/g, "");
      if (key !== "payment_heading") expect(outside("hindi"), key).toMatch(/[ऀ-ॿ]/);
      expect(outside("hinglish"), key).not.toMatch(/[ऀ-ॿ]/);
      expect(outside("english"), key).not.toMatch(/[ऀ-ॿ]/);
    }
  });

  it("records the span of every filled value", () => {
    const { text, filled } = fixedText("price_from", "english", samples);
    expect(text).toBe("Kedarnath Yatra: from ₹5,999 per person.");
    expect(filled.map(({ start, end }) => text.slice(start, end))).toEqual(["Kedarnath Yatra", "₹5,999"]);
  });

  it("a missing slot throws", () => {
    expect(() => fixedText("price_from", "english", { package: "Kedarnath Yatra" })).toThrow(RangeError);
  });

  it("every slot of every text has a sample, so none is untested", () => {
    for (const key of keys) {
      for (const language of liteLanguages) {
        for (const slot of slotsOf(fixedTextTable[key][language]))
          expect(samples[slot], `${key} ${slot}`).toBeDefined();
      }
    }
  });

  it("the price says 'from' in all three languages, and never reads as a room's price", () => {
    expect(fixedText("price_from", "english", samples).text).toContain("from ₹5,999");
    expect(fixedText("price_from", "hindi", samples).text).toContain("₹5,999 प्रति व्यक्ति से शुरू");
    expect(fixedText("price_from", "hinglish", samples).text).toContain("₹5,999 per person se shuru");
  });

  it("every payment text states the trip total beside the advance, never the advance alone", () => {
    for (const key of ["price_full", "book_payment", "payment_again"] as const) {
      for (const language of liteLanguages) {
        expect(fixedTextTable[key][language], `${key} ${language}`).toContain("{total}");
      }
    }
    for (const language of liteLanguages) expect(fixedTextTable.book_payment_full[language]).toContain("{total}");
  });

  it("the identity line never claims to be a person or a bot", () => {
    for (const language of liteLanguages) {
      const { text } = fixedText("identity", language, samples);
      expect(text.toLowerCase()).not.toMatch(/\bbot\b|just an ai|a person|insaan|इंसान/);
    }
  });

  it("words for a party, a room and a hold", () => {
    expect(travellersWords(3, 1, "hindi")).toBe("3 वयस्क, 1 बच्चा");
    expect(travellersWords(1, 0, "english")).toBe("1 adult");
    expect(travellersWords(2, 2, "hinglish")).toBe("2 adults, 2 children");
    expect(travellersWords(2, 3, "hindi")).toBe("2 वयस्क, 3 बच्चे");
    expect(roomWords("double", "english")).toBe("double sharing");
    expect(roomWords("quad", "hindi")).toBe("क्वाड शेयरिंग");
    expect(holdUntilWords(new Date("2026-11-16T12:30:00Z"), parseCalendarDate("2026-11-12"), "Asia/Kolkata")).toBe(
      "Mon 16 Nov, 6 pm",
    );
    expect(holdUntilWords(new Date("2026-11-16T12:45:00Z"), parseCalendarDate("2026-11-12"), "Asia/Kolkata")).toBe(
      "Mon 16 Nov, 6:15 pm",
    );
  });
});
