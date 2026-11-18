// A stage breakdown as the api sends it, and the helpers Home's tests share.
import type { StageBreakdown } from "@travel-crm/contracts/crm";
import { vi } from "vitest";

export const breakdown: StageBreakdown = {
  total: 20,
  stages: { new: 7, contacted: 5, quote_sent: 3, booking_requested: 2, won: 2, lost: 1, not_a_lead: 4 },
};

/** The bodies of every request the app has sent, to see what was asked (the stub records only the paths). */
export function sentBodies(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(
      ([input, init]) =>
        `${String(input instanceof Request ? input.url : input)} ${typeof init?.body === "string" ? init.body : ""}`,
    );
}
