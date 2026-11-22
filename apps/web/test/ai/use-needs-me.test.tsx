// What the AI needs from the signed-in member, as Home's "Needs your attention" and My tasks' "AI needs you" read it:
// the rows the api sends (20 of each at most) and the count of every one waiting, from the api's totals.
import { waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useNeedsMe } from "@/ai/use-needs-me";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const chat = (index: number) => ({
  conversationId: `0199e7a0-0000-7000-8000-0000000007${String(index).padStart(2, "0")}`,
  name: `Chat ${String(index)}`,
  reason: null,
  since: "2026-10-16T03:00:00.000Z",
});
const suggestion = (index: number) => ({
  id: `0199e7a0-0000-7000-8000-0000000006${String(index).padStart(2, "0")}`,
  leadId: `0199e7a0-0000-7000-8000-0000000005${String(index).padStart(2, "0")}`,
  name: `Lead ${String(index)}`,
  kind: "lost",
  lostReason: null,
  reason: "Booked elsewhere",
  createdAt: "2026-10-16T03:00:00.000Z",
});
const twenty = <T,>(make: (index: number) => T) => Array.from({ length: 20 }, (_, index) => make(index));

/** The hook, rendered inside the app's providers (renderWithApi wraps a component, so the hook sits in one). */
function needsOf(me = member({ isOwner: true })) {
  const result: { current: ReturnType<typeof useNeedsMe> | null } = { current: null };
  function Probe(): ReactNode {
    result.current = useNeedsMe();
    return null;
  }
  renderWithApi(<Probe />, newQueryClient(), me);
  return result;
}

describe("useNeedsMe", () => {
  it("counts every one waiting, past the 20 rows of each the api sends", async () => {
    stubApi({
      "ai.handedOver": { data: { chats: twenty(chat), total: 25 } },
      "ai.stageSuggestions": { data: { suggestions: twenty(suggestion), total: 22 } },
    });
    const needs = needsOf();
    await waitFor(() => {
      expect(needs.current?.count).toBe(47);
    });
    expect(needs.current?.handedOver).toHaveLength(20);
    expect(needs.current?.suggestions).toHaveLength(20);
  });

  it("counts nothing a member may not see", async () => {
    stubApi({
      "ai.handedOver": { data: { chats: twenty(chat), total: 25 } },
      "ai.stageSuggestions": { data: { suggestions: twenty(suggestion), total: 22 } },
    });
    const needs = needsOf(member({ permissions: ["leads:view"] }));
    await waitFor(() => {
      expect(needs.current?.count).toBe(22);
    });
  });
});
