// A stand-in for the subscriptions the request checks read: stored facts that give the status a test asks for today.
import type { PlanModule, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import type { SubscriptionAccess, SubscriptionFacts } from "@travel-crm/domain/subscriptions";

const DAY_MS = 24 * 60 * 60 * 1000;

export function stubSubscriptions(
  status: SubscriptionStatus | "none",
  modules: readonly PlanModule[],
  planName = "Starter",
): Pick<SubscriptionAccess, "factsOf" | "now"> {
  const now = Date.now();
  const stored = status === "suspended" ? "active" : status;
  const facts =
    status === "none"
      ? null
      : ({
          timeZone: "UTC",
          policy: { trialDays: 14, pastDueDays: 7, readOnlyDays: 14 },
          row: {
            organizationId: "0199e7a0-0000-7000-8000-0000000000c1",
            status: stored,
            statusChangedAt: new Date(now - DAY_MS),
            trialEndsOn: status === "trial" ? new Date(now + 10 * DAY_MS) : null,
            paidThrough: status === "active" || status === "suspended" ? new Date(now + 30 * DAY_MS) : null,
            manualSuspensionAt: status === "suspended" ? new Date(now) : null,
            extraSeats: 0,
            extraModules: [],
            plan: {
              name: planName,
              modules: [...modules],
              seatLimit: 5,
              whatsappNumberLimit: 1,
              storageLimitBytes: 1n,
            },
          },
        } as unknown as SubscriptionFacts);
  return { now: () => new Date(now), factsOf: () => Promise.resolve(facts) };
}
