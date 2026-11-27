// The UPI link: spaces as %20, whole characters only, and always short enough for the PDF's contract.
import { describe, expect, it } from "vitest";
import { MAX_UPI_LINK_LENGTH, upiPayLink } from "../../src/quotes/upi-link.js";

const settings = { upiId: "sharma@bank", upiName: "Sharma Holidays" };

describe("upiPayLink", () => {
  it("writes spaces as %20 and keeps the order pa, pn, am, cu, tn", () => {
    expect(upiPayLink(settings, { amountPaise: 300_000, note: "Goa 4 days (Dec)" })).toBe(
      "upi://pay?pa=sharma%40bank&pn=Sharma%20Holidays&am=3000.00&cu=INR&tn=Goa%204%20days%20%28Dec%29",
    );
  });

  it("has no amount or note without a payment, and none without a UPI id or an amount", () => {
    expect(upiPayLink(settings)).toBe("upi://pay?pa=sharma%40bank&pn=Sharma%20Holidays&cu=INR");
    expect(upiPayLink({ ...settings, upiId: "" })).toBeNull();
    expect(upiPayLink(settings, { amountPaise: 0, note: "x" })).toBeNull();
  });

  it("cuts the note by whole characters, never through an emoji", () => {
    const link = upiPayLink(settings, { amountPaise: 100, note: `${"a".repeat(49)}🌴🌴` }) ?? "";
    expect(decodeURIComponent(link.split("tn=")[1] ?? "")).toBe(`${"a".repeat(49)}🌴`);
  });

  it("always fits the PDF's line, shortening the note and then the name", () => {
    const link = upiPayLink(
      { upiId: `${"a".repeat(90)}@bank`, upiName: "🌴".repeat(100) },
      { amountPaise: 100, note: "🌴".repeat(100) },
    );
    expect(link?.length).toBeLessThanOrEqual(MAX_UPI_LINK_LENGTH);
    expect(link).toContain(`pa=${"a".repeat(90)}%40bank`);
  });
});
