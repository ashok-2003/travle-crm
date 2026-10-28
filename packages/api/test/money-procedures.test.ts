// Money is read from a session read afresh, never the cookie cache (M2, M3): a role taken away stops showing the books,
// the dashboard's money and a quote's delete at once. A session the database no longer holds is refused by each.
import { describe, expect, it } from "vitest";
import { callerFor, outcome } from "./request-probe.js";

const refusal = (call: Promise<unknown>) => outcome(call as Promise<string>);

describe("the money procedures read the session afresh", () => {
  const gone = () => callerFor({ modules: ["quotes", "accounts"], isOwner: true, storedSession: null }).caller;
  const quoteId = crypto.randomUUID();
  const period = { from: "2026-11-01", to: "2026-11-30" };

  it("refuses every finance read when the stored session is gone, though the cache still holds it", async () => {
    const { finance } = gone();
    for (const call of [
      finance.summary(period),
      finance.bookings({}),
      finance.costs({ quoteId }),
      finance.expenses(period),
    ])
      expect(await refusal(call)).toBe("UNAUTHORIZED");
  });

  it("refuses the money summary and a quote's delete the same way", async () => {
    const { quotes } = gone();
    expect(await refusal(quotes.moneySummary(period))).toBe("UNAUTHORIZED");
    expect(await refusal(quotes.delete({ quoteId }))).toBe("UNAUTHORIZED");
  });
});
