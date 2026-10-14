// What the email port refuses before anything is sent: header injection, forged envelope headers, encoded-word names,
// addresses that are really lists, and placeholder addresses.
import { describe, expect, it } from "vitest";
import { assertSafeHeaders, type EmailMessage } from "../../src/email/index.js";

const message: EmailMessage = {
  to: { name: "Asha Owner", address: "asha@agency.example" },
  fromName: "Sharma Travels",
  replyTo: "hello@sharma.example",
  subject: "Hello",
  text: "Hi",
  html: "<p>Hi</p>",
};

describe("assertSafeHeaders", () => {
  it("accepts an ordinary message, including names with quotes and commas", () => {
    expect(() => {
      assertSafeHeaders(message);
      assertSafeHeaders({ ...message, to: { name: 'Asha "Boss", Owner', address: "asha@agency.example" } });
      assertSafeHeaders({ ...message, headers: { "List-Unsubscribe": "<https://app.example/x>", "X-Entity": "1" } });
    }).not.toThrow();
  });

  it("refuses a line break in the name, address, Reply-To or any header", () => {
    for (const changed of [
      { to: { name: "Asha\r\nBcc: x@example.test", address: "asha@agency.example" } },
      { to: { address: "asha@agency.example\r\nBcc: x@example.test" } },
      { replyTo: "hello@sharma.example\nBcc: x@example.test" },
      { fromName: "Sharma\r\nTravels" },
    ]) {
      expect(() => {
        assertSafeHeaders({ ...message, ...changed });
      }, JSON.stringify(changed)).toThrow(/line break/);
    }
  });

  it("refuses addresses that are lists or carry display names, quotes or comments", () => {
    for (const address of [
      "a@agency.example, b@agency.example",
      "a@agency.example;b@agency.example",
      '"a"@agency.example',
      "<a@agency.example>",
      "Asha <a@agency.example>",
      "not-an-address",
    ]) {
      expect(() => {
        assertSafeHeaders({ ...message, to: { address } });
      }, address).toThrow(/address/);
      expect(() => {
        assertSafeHeaders({ ...message, replyTo: address });
      }, address).toThrow(/address/);
    }
  });

  it("refuses an encoded word in the sender's name", () => {
    expect(() => {
      assertSafeHeaders({ ...message, fromName: "=?utf-8?B?QmNjOiB4?=" });
    }).toThrow(/encoded/);
  });

  it("refuses custom headers that the sender controls itself, in any case", () => {
    for (const name of [
      "Bcc",
      "bcc",
      "Reply-To",
      "TO",
      "Cc",
      "From",
      "Sender",
      "Return-Path",
      "Subject",
      "MIME-Version",
      "Content-Type",
      "content-transfer-encoding",
    ]) {
      expect(() => {
        assertSafeHeaders({ ...message, headers: { [name]: "x" } });
      }, name).toThrow(/header/);
    }
  });

  it("refuses placeholder addresses, whatever their case", () => {
    for (const address of ["staff-1@placeholder.invalid", "Staff@Example.INVALID"]) {
      expect(() => {
        assertSafeHeaders({ ...message, to: { address } });
      }, address).toThrow(/placeholder/);
    }
  });
});
