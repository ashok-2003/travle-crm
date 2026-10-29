// The message library's blanks (release 5): one function fills them for the inbox, the lead page and the owner's
// preview; a blank with no value stays visible, and an unknown one cannot be saved.
import { describe, expect, it } from "vitest";
import { blanksIn, createQuickReplyInput, fillBlanks, hasOpenBlank, unknownBlanks } from "../../src/inbox/index.js";

describe("fillBlanks", () => {
  it("fills every known blank, each time it appears", () => {
    expect(
      fillBlanks("Hi {name}, {name}! {destination} in {month}", { name: "Asha", destination: "Spiti", month: "May" }),
    ).toBe("Hi Asha, Asha! Spiti in May");
  });

  it("leaves a blank with no value in the text, for the person to type", () => {
    const text = fillBlanks("Pay {amount} here: {link}", { amount: "₹12,500.00" });
    expect(text).toBe("Pay ₹12,500.00 here: {link}");
    expect(hasOpenBlank(text)).toBe(true);
    expect(blanksIn(text)).toEqual(["link"]);
  });

  it("leaves braces that are not blanks alone", () => {
    expect(fillBlanks("Use {Name} and {1}", { name: "x" })).toBe("Use {Name} and {1}");
    expect(hasOpenBlank("No blanks here")).toBe(false);
  });
});

describe("a library message's blanks", () => {
  it("accepts the six the library knows", () => {
    const body = "{name} {destination} {month} {agent} {amount} {link}";
    expect(createQuickReplyInput.safeParse({ shortcut: "all", title: "All", body }).success).toBe(true);
  });

  it("refuses one it does not know", () => {
    expect(unknownBlanks("Hi {nmae}, {name}")).toEqual(["nmae"]);
    const result = createQuickReplyInput.safeParse({ shortcut: "typo", title: "Typo", body: "Hi {nmae}" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["body"], message: "UNKNOWN_BLANK" });
  });
});
