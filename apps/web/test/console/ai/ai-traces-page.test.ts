// The AI turns page reads only ids from its address: a chat filters the list only when it is a UUID.
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";

const organizationId = "0199a000-0000-7000-8000-000000000002";
const chat = "0199a000-0000-7000-8000-00000000c4a7";

describe("the AI turns page", { timeout: 20_000 }, () => {
  it.each([
    ["x", null],
    [["a"], null],
    [undefined, null],
    [chat, chat],
  ])("takes ?chat=%j as %j", async (given, expected) => {
    const page = await import("@/app/console/organizations/[organizationId]/ai-traces/page");
    const element = await page.default({
      params: Promise.resolve({ organizationId }),
      searchParams: Promise.resolve(given === undefined ? {} : { chat: given }),
    });
    expect(isValidElement(element) && element.props).toEqual({ organizationId, conversationId: expected });
  });
});
