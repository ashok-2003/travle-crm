// The browser reads the plans on sale from the api on the page's own address; a refusal or an answer it can't read is
// a failure, asked again like a sleeping api.
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchPlansOnSale } from "@/marketing/plans-on-sale";

const starter = {
  key: "starter",
  name: "Starter",
  monthlyPricePaise: 199_900,
  yearlyPricePaise: 1_999_000,
  extraSeatMonthlyPricePaise: 29_900,
  extraSeatYearlyPricePaise: null,
  seatLimit: 3,
  whatsappNumberLimit: 1,
  storageLimitBytes: 5_000_000_000,
  modules: ["crm", "inbox"],
};

const answering = (response: Response) => vi.fn<typeof fetch>(() => Promise.resolve(response));

describe("fetchPlansOnSale", () => {
  it("asks the api on the page's own address", async () => {
    const fetch = answering(Response.json([starter]));
    expect(await fetchPlansOnSale(fetch)).toEqual([starter]);
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/public/plans");
  });

  it.each([
    ["a refusal", Response.json({ code: "TOO_MANY_REQUESTS" }, { status: 429 })],
    ["an answer it can't read", Response.json([{ ...starter, monthlyPricePaise: "₹1,999" }])],
  ])("fails on %s", async (_, response) => {
    await expect(fetchPlansOnSale(answering(response))).rejects.toThrow();
  });
});
