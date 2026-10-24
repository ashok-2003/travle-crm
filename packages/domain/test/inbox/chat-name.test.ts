// The name a chat is shown by: the CRM name, else the WhatsApp profile name, else none (V3): the stand-in name a nameless number
// gave its person is no name.
import { describe, expect, it } from "vitest";
import { chatNameOf } from "../../src/inbox/chat-name.js";

const phoneE164 = "+919838598736";

describe("chatNameOf", () => {
  it("prefers the person's own name", () => {
    expect(chatNameOf({ phoneE164, profileName: "Pri", person: { name: "Priya Shah" } })).toBe("Priya Shah");
  });

  it("treats the stand-in name as none and uses the profile name", () => {
    const person = { name: "WhatsApp +91 98385 98736" };
    expect(chatNameOf({ phoneE164, profileName: "Priya", person })).toBe("Priya");
  });

  it("is null for a number with no name at all", () => {
    expect(chatNameOf({ phoneE164, profileName: null, person: { name: "WhatsApp +91 98385 98736" } })).toBeNull();
    expect(chatNameOf({ phoneE164, profileName: "  ", person: null })).toBeNull();
  });
});
