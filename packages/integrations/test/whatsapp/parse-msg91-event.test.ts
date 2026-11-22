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

  it("reads a tap's id from interactive as an object, as a string, and from messages", () => {
    expect(one("tap-interactive-object")).toMatchObject({
      kind: "text",
      text: "Book these seats",
      buttonReplyId: "book:0190f3a2-0000-7000-8000-000000000001",
      replyKind: "button",
      quotedWamid: "wamid.CARD1",
    });
    expect(one("tap-interactive-string")).toMatchObject({
      kind: "text",
      text: "Change something",
      buttonReplyId: "change:0190f3a2-0000-7000-8000-000000000001",
      replyKind: "button",
    });
    expect(one("tap-messages-only")).toMatchObject({
      kind: "text",
      text: "Book these seats",
      buttonReplyId: "book:0190f3a2-0000-7000-8000-000000000001",
      replyKind: "button",
    });
  });

  it("reads a list reply and a template's quick reply", () => {
    expect(one("tap-list-reply")).toMatchObject({
      kind: "text",
      text: "Goa in December",
      buttonReplyId: "row-7",
      replyKind: "list",
    });
    expect(one("inbound-button")).toMatchObject({
      kind: "text",
      text: "Send me the quote",
      buttonReplyId: "quote",
      replyKind: "quick_reply",
    });
  });

  it("keeps the tapped title as the words, and no id when none came", () => {
    expect(one("tap-title-only")).toMatchObject({
      kind: "text",
      text: "Book these seats",
      buttonReplyId: null,
      replyKind: null,
    });
    expect(one("inbound-text")).toMatchObject({ buttonReplyId: null, replyKind: null });
  });

  describe("a tap is read strictly", () => {
    const base = { customerNumber: "919876543210", integratedNumber: "918888800000", uuid: "wamid.S1", direction: "0" };
    const reply = (id: unknown) => ({ type: "button_reply", button_reply: { id, title: "Book these seats" } });
    const parsed = (extra: Record<string, unknown>) => {
      const [event] = parseMsg91Event({ ...base, ...extra });
      return event;
    };
    const untapped = { buttonReplyId: null, replyKind: null };

    it("ignores an interactive or button field on a plain text message, and a text that looks like an id", () => {
      expect(parsed({ contentType: "text", text: "hi", interactive: reply("book:1") })).toMatchObject({
        text: "hi",
        ...untapped,
      });
      expect(parsed({ contentType: "text", text: "hi", button: { payload: "Stop", text: "Stop" } })).toMatchObject(
        untapped,
      );
      expect(parsed({ contentType: "text", text: "book:0190f3a2-0000-7000-8000-000000000001" })).toMatchObject({
        text: "book:0190f3a2-0000-7000-8000-000000000001",
        ...untapped,
      });
    });

    it("never reads a template's quick reply or a list row as a reply button", () => {
      expect(
        parsed({
          contentType: "button",
          button: { payload: "book:0190f3a2-0000-7000-8000-000000000001", text: "Yes" },
        }),
      ).toMatchObject({ replyKind: "quick_reply" });
      expect(
        parsed({
          contentType: "interactive",
          interactive: { type: "list_reply", list_reply: { id: "book:1", title: "A" } },
        }),
      ).toMatchObject({ buttonReplyId: "book:1", replyKind: "list" });
    });

    it("keeps an id exactly as sent, and takes none that is empty, too long, odd or missing", () => {
      const exact = "book:0190f3a2-0000-7000-8000-000000000001";
      expect(parsed({ contentType: "interactive", interactive: reply(exact) })).toMatchObject({
        buttonReplyId: exact,
        replyKind: "button",
      });
      expect(parsed({ contentType: "interactive", interactive: reply("x".repeat(256)) })).toMatchObject({
        replyKind: "button",
      });
      for (const id of ["", "x".repeat(257), "a\u0000b", 42, null]) {
        expect(parsed({ contentType: "interactive", text: "Book these seats", interactive: reply(id) })).toMatchObject({
          kind: "text",
          text: "Book these seats",
          ...untapped,
        });
      }
      expect(
        parsed({ contentType: "interactive", text: "Book these seats", interactive: { type: "button_reply" } }),
      ).toMatchObject(untapped);
      expect(parsed({ contentType: "interactive", text: "Hi", interactive: "{not json" })).toMatchObject({
        text: "Hi",
        ...untapped,
      });
    });
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

  it("keeps the send's request id and the customer's number on a status, and the request id on an echo", () => {
    expect(one("status-delivered")).toMatchObject({ requestId: "req-out-1", customerNumber: "+919876543210" });
    expect(one("status-failed")).toMatchObject({ requestId: null });
    expect(one("echo-own-send")).toMatchObject({ type: "echo", requestId: "req-own-1", ourSend: true });
    // The phone app's echoes always carry a contentType: never ours.
    expect(one("echo-phone-image")).toMatchObject({ type: "echo", ourSend: false });
    expect(one("echo-text")).toMatchObject({ type: "echo", requestId: null });
    const [named] = parseMsg91Event({
      customerNumber: "919876543210",
      integratedNumber: "918888800000",
      uuid: "w",
      direction: "1",
      request_id: "req-9",
      text: "Hi",
    });
    expect(named).toMatchObject({ type: "echo", requestId: "req-9" });
  });

  it("reads the words and files MSG91 keeps only inside content", () => {
    expect(one("echo-own-send")).toMatchObject({ kind: "text", text: "Your Goa quote is ready" });
    expect(one("echo-phone-image")).toMatchObject({
      kind: "image",
      caption: "Your hotel",
      mediaUrl: "https://media.example/phone/2",
    });
    expect(one("echo-phone-file")).toMatchObject({
      kind: "document",
      fileName: "itinerary.pdf",
      mediaUrl: "https://media.example/phone/3",
    });
    const base = { customerNumber: "919876543210", integratedNumber: "918888800000", uuid: "w", direction: "1" };
    // A document known only by its messageType, and a top-level name that wins over content's.
    expect(
      parseMsg91Event({ ...base, messageType: "document", content: { attachment_url: "https://m.example/d" } })[0],
    ).toMatchObject({ kind: "document", mediaUrl: "https://m.example/d" });
    expect(
      parseMsg91Event({ ...base, contentType: "text", text: "Top", content: JSON.stringify({ text: "Inner" }) })[0],
    ).toMatchObject({ text: "Top" });
    expect(parseMsg91Event({ ...base, contentType: "image", content: "not json" })[0]).toMatchObject({
      kind: "image",
      mediaUrl: null,
      caption: null,
    });
  });

  it("drops an edit or a deletion quietly, from the customer or from the phone", () => {
    expect(one("inbound-edit")).toEqual({ type: "ignored", integratedNumber: "918888800000" });
    expect(one("echo-revoke")).toEqual({ type: "ignored", integratedNumber: "918888800000" });
  });

  it("reads a click-to-WhatsApp ad's words and the ad from Meta's own message", () => {
    expect(one("inbound-ad")).toMatchObject({
      type: "inbound",
      kind: "text",
      text: "Hi, is the Goa trip still on?",
      referral: { sourceId: "120210000000001", headline: "Goa in December", sourceUrl: "https://fb.me/goa-dec" },
    });
    expect(one("inbound-ad")).not.toHaveProperty("unknownType");
    const [wordless] = parseMsg91Event({
      customerNumber: "919876543210",
      integratedNumber: "918888800000",
      uuid: "w",
      contentType: "referral",
      messages: [{ type: "image", referral: { headline: "Spiti" } }],
    });
    expect(wordless).toMatchObject({ kind: "unsupported", text: null, referral: { headline: "Spiti" } });
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
