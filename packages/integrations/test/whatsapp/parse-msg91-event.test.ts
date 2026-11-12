// The parser reads MSG91's loosely named events and never throws (ADR 0035). Fixtures stand in for the spike's payloads.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMsg91Event } from "../../src/whatsapp/index.js";

const fixture = (name: string): string =>
  readFileSync(path.join(import.meta.dirname, "fixtures", `${name}.json`), "utf8");
const one = (name: string) => {
  const events = parseMsg91Event(fixture(name));
  expect(events).toHaveLength(1);
  return events[0];
};

describe("parseMsg91Event", () => {
  it("reads a text message, trimmed, with the number as E.164 and the time in seconds", () => {
    expect(one("inbound-text")).toMatchObject({
      type: "inbound",
      wamid: "wamid.IN1",
      integratedNumber: "918888800000",
      customerNumber: "+919876543210",
      customerName: "Priya Sharma",
      kind: "text",
      text: "Hi, Goa trip for 4 in December?",
      occurredAt: new Date(1792749600 * 1000),
    });
  });

  it("adds +91 to ten digits and keeps a foreign number's own country code", () => {
    expect(one("inbound-image")).toMatchObject({ customerNumber: "+919876543210" });
    const [foreign] = parseMsg91Event({ customerNumber: "447911123456", integratedNumber: "918888800000", uuid: "w" });
    expect(foreign).toMatchObject({ customerNumber: "+447911123456" });
  });

  it("reads an image with its caption and link, and a document with its name", () => {
    expect(one("inbound-image")).toMatchObject({
      kind: "image",
      caption: "Our passports",
      mediaUrl: "https://media.example/m/1",
    });
    expect(one("inbound-document")).toMatchObject({
      kind: "document",
      fileName: "itinerary.pdf",
      customerNumber: "+919876543210",
      integratedNumber: "918888800000",
    });
  });

  it("reads a location, a reaction (JSON inside a string), a reply and a button", () => {
    expect(one("inbound-location")).toMatchObject({ kind: "location", latitude: 12.9716, longitude: 77.5946 });
    expect(one("inbound-reaction")).toMatchObject({
      kind: "reaction",
      reaction: { emoji: "👍", targetWamid: "wamid.OUT1" },
    });
    expect(one("inbound-reply")).toMatchObject({ kind: "text", text: "Yes please", quotedWamid: "wamid.OUT1" });
    expect(one("inbound-button")).toMatchObject({ kind: "text", text: "Send me the quote" });
  });

  it("keeps a kind it does not know as unsupported, with its content type for the log", () => {
    expect(one("inbound-unsupported")).toMatchObject({
      type: "inbound",
      kind: "unsupported",
      text: null,
      unknownType: "order",
    });
    expect(one("inbound-text")).not.toHaveProperty("unknownType");
    const [odd] = parseMsg91Event({
      customerNumber: "919876543210",
      integratedNumber: "918888800000",
      uuid: "w",
      contentType: "Hello there, 98765!",
    });
    expect(odd).toMatchObject({ kind: "unsupported", unknownType: "other" });
  });

  describe("the ad a chat came from (click-to-WhatsApp referral)", () => {
    const base = { customerNumber: "919876543210", integratedNumber: "918888800000", uuid: "w", text: "Hi" };
    const referral = {
      source_id: "120210",
      headline: "Goa in December",
      source_url: "https://fb.me/x",
      ctwa_clid: "c",
    };
    const parsed = (extra: Record<string, unknown>) => parseMsg91Event({ ...base, ...extra })[0];

    it("reads a referral on the message, on message, on context and on content (also as JSON in a string)", () => {
      const expected = { sourceId: "120210", headline: "Goa in December", sourceUrl: "https://fb.me/x" };
      expect(parsed({ referral })).toMatchObject({ referral: expected });
      expect(parsed({ message: { referral } })).toMatchObject({ referral: expected });
      expect(parsed({ context: { referral } })).toMatchObject({ referral: expected });
      expect(parsed({ content: { referral } })).toMatchObject({ referral: expected });
      expect(parsed({ content: JSON.stringify({ referral }) })).toMatchObject({ referral: expected });
      expect(parsed({ referral: { sourceId: "9", sourceUrl: "https://x.example" } })).toMatchObject({
        referral: { sourceId: "9", headline: null, sourceUrl: "https://x.example" },
      });
    });

    it("cleans control characters and spaces out of the ad's fields, and drops a referral left empty", () => {
      expect(parsed({ referral: { headline: "a\u0000b" } })).toMatchObject({ referral: { headline: "ab" } });
      expect(parsed({ referral: { headline: "  Goa \n\t in\u0007  Dec  ", source_id: "1\u00002" } })).toMatchObject({
        referral: { sourceId: "12", headline: "Goa in Dec" },
      });
      expect(parsed({ referral: { headline: "\u0000\u0001", source_id: " \u0000", source_url: "x" } })).toMatchObject({
        referral: null,
      });
    });

    it("keeps a headline-only referral, and ignores an empty one or none", () => {
      expect(parsed({ referral: { headline: "Spiti" } })).toMatchObject({
        referral: { sourceId: null, headline: "Spiti", sourceUrl: null },
      });
      expect(parsed({ referral: { source_url: "https://x.example" } })).toMatchObject({ referral: null });
      expect(parsed({ referral: {} })).toMatchObject({ referral: null });
      expect(parsed({ referral: "nonsense" })).toMatchObject({ referral: null });
      expect(parsed({})).toMatchObject({ referral: null });
    });
  });

  it("reads a message sent from the phone as an echo, and a delivery report as a status", () => {
    expect(one("echo-text")).toMatchObject({ type: "echo", wamid: "wamid.PH1", text: "Sent from the phone app" });
    expect(one("status-delivered")).toMatchObject({
      type: "status",
      wamid: "wamid.OUT1",
      status: "delivered",
      reasonCode: null,
    });
    expect(one("status-failed")).toMatchObject({ type: "status", status: "failed", reasonCode: "131047" });
  });

  it("reads a batch, each event on its own", () => {
    const events = parseMsg91Event(fixture("batch"));
    expect(events.map((event) => event.type)).toEqual(["inbound", "status"]);
  });

  it("never throws: garbage, empty and wrongly shaped bodies are one unknown event", () => {
    for (const body of [
      "",
      "not json",
      "{",
      "[]",
      "null",
      "42",
      "{}",
      '{"customerNumber":"1"}',
      [],
      null,
      undefined,
      7,
      { events: "x" },
    ]) {
      const events = parseMsg91Event(body);
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.type === "unknown")).toBe(true);
    }
  });

  it("keeps the integrated number on an unknown event that names one, so it can still be routed", () => {
    expect(parseMsg91Event({ integratedNumber: "918888800000", something: "else" })).toEqual([
      { type: "unknown", integratedNumber: "918888800000" },
    ]);
  });
});
