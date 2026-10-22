// The enquiry form's two message files are loaded: one for the visitor's screens, one for the agency's settings.
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";

describe("messages", () => {
  it("loads both namespaces of the website form", () => {
    expect(messages).toHaveProperty("websiteForm");
    expect(messages).toHaveProperty("websiteFormSettings");
  });
});
