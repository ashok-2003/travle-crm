// What leaves for the tracing service has its phone numbers and email addresses masked, in plain text and inside JSON,
// while ids, amounts and counts stay as they were and JSON stays JSON.
import { describe, expect, it } from "vitest";
import { maskContacts, maskTraceData } from "../../src/tracing/mask.js";

describe("masking contacts", () => {
  it.each([
    ["9876543210", "[phone]"],
    ["call me on 98765 43210 please", "call me on [phone] please"],
    ["+91 98765 43210", "[phone]"],
    ["+91-98765-43210", "[phone]"],
    ["+919876543210", "[phone]"],
    ["919876543210", "[phone]"],
    ["09876543210", "[phone]"],
    ["number:\n9876543210.", "number:\n[phone]."],
    ["my uk one is +44 7911 123456", "my uk one is [phone]"],
    ["mail priya.k+trips@example.co.in now", "mail [email] now"],
    ["PRIYA@EXAMPLE.COM", "[email]"],
  ])("masks %j", (text, masked) => {
    expect(maskContacts(text)).toBe(masked);
  });

  it.each([
    "0196f2a1-9876-5432-1098-919876543210",
    "₹59,999 for 2 adults on 2026-11-14",
    "12345",
    "1763275000000",
    "order 5876543210123",
    "wamid.HBgMOTE5ODc2NTQzMjEwFQIAEhgg",
  ])("leaves %j alone", (text) => {
    expect(maskContacts(text)).toBe(text);
  });
});

describe("masking what is traced", () => {
  it("masks the strings inside JSON text and keeps it JSON", () => {
    const data = JSON.stringify([
      { role: "user", content: "I am Priya, 9876543210\nmail: priya@example.com" },
      { amount: 9876543210, id: "0196f2a1-9876-5432-1098-919876543210" },
    ]);
    expect(JSON.parse(String(maskTraceData({ data })))).toEqual([
      { role: "user", content: "I am Priya, [phone]\nmail: [email]" },
      { amount: 9876543210, id: "0196f2a1-9876-5432-1098-919876543210" },
    ]);
  });

  it("masks text that is not JSON, and a bare number that is a phone", () => {
    expect(maskTraceData({ data: "ring 9876543210" })).toBe("ring [phone]");
    expect(maskTraceData({ data: "9876543210" })).toBe("[phone]");
  });

  it("masks decoded metadata values of any shape", () => {
    expect(maskTraceData({ data: { why: "asked for +919876543210", count: 3, flags: [true, "a@b.co"] } })).toEqual({
      why: "asked for [phone]",
      count: 3,
      flags: [true, "[email]"],
    });
    expect(maskTraceData({ data: null })).toBeNull();
    expect(maskTraceData({ data: 42 })).toBe(42);
  });
});
