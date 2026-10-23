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

  it("keeps a kind it does not know as unsupported", () => {
    expect(one("inbound-unsupported")).toMatchObject({ type: "inbound", kind: "unsupported", text: null });
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
