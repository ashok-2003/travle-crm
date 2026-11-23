// An assignment rule as a tab opened before the several-numbers release saves it: with no WhatsApp number named, it is
// a rule with no number, not a refusal (the release window, docs/deploy-checklist.md).
import { describe, expect, it } from "vitest";
import { assignmentRuleInput } from "../../src/crm/index.js";

const assignee = "0199a000-0000-7000-8000-0000000000a1";

describe("an assignment rule", () => {
  it("reads a rule an older tab sends, without a number, as one with no number", () => {
    expect(
      assignmentRuleInput.parse({ source: "website", destinationId: null, tripType: null, assigneeUserId: assignee }),
    ).toEqual({
      source: "website",
      destinationId: null,
      tripType: null,
      whatsappConnectionId: null,
      assigneeUserId: assignee,
    });
  });

  it("still needs one condition", () => {
    expect(
      assignmentRuleInput.safeParse({ source: null, destinationId: null, tripType: null, assigneeUserId: assignee })
        .success,
    ).toBe(false);
  });
});
