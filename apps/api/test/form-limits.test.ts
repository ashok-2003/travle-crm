// The website form's limits in their order (spec 6.1, 6.3): the address first, the agency's by the whole key, and one
// 60-an-hour ceiling for the agency that a flood without addresses can use only a third of.
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { describe, expect, it } from "vitest";
import { hitFormLimits } from "../src/form-limits.js";
import { countingLimiter } from "./support/website-form.js";

const logger = createMemoryLogger();
const KEY = "K".repeat(38);

function hits(limiter: ReturnType<typeof countingLimiter>, kind: "view" | "submit", address: string | null, key = KEY) {
  return hitFormLimits({ limiter, logger, key, address, kind });
}

describe("hitFormLimits", () => {
  it("counts the address first and the agency by the whole key", async () => {
    const limiter = countingLimiter();
    await hits(limiter, "submit", "203.0.113.1");
    expect(limiter.keys).toEqual([
      "form-submit-visitor:203.0.113.1",
      `form-submit-agency-visitor:${KEY}:203.0.113.1`,
      `form-submit-agency:${KEY}`,
    ]);
  });

  it("holds an agency to 60 an hour in all, with or without an address", async () => {
    const limiter = countingLimiter();
    let allowed = 0;
    for (let call = 0; call < 100; call += 1) {
      // Every call from a new address, as a distributed flood would; every third has none.
      const address = call % 3 === 0 ? null : `198.51.100.${String(call)}`;
      if ((await hits(limiter, "submit", address)).allowed) allowed += 1;
    }
    expect(allowed).toBeLessThanOrEqual(60);
  });

  it("lets requests with no address use only 20 of the 60, leaving the rest for those with one", async () => {
    const limiter = countingLimiter();
    const results: boolean[] = [];
    for (let call = 0; call < 25; call += 1) results.push((await hits(limiter, "submit", null)).allowed);
    expect(results.filter(Boolean)).toHaveLength(20);
    const refused = await hits(limiter, "submit", null);
    expect(refused).toMatchObject({ allowed: false, agencyRefused: true });
    for (let call = 0; call < 40; call += 1) {
      expect((await hits(limiter, "submit", `198.51.100.${String(call)}`)).allowed).toBe(true);
    }
    expect((await hits(limiter, "submit", "198.51.100.200")).allowed).toBe(false);
  });

  it("does not carry a flood on one key over to another key of the same agency", async () => {
    const limiter = countingLimiter();
    for (let call = 0; call < 25; call += 1) await hits(limiter, "submit", null);
    expect((await hits(limiter, "submit", null, "N".repeat(38))).allowed).toBe(true);
  });

  it("holds an agency's views to 600 an hour with or without an address, and an address to 60 a minute", async () => {
    const limiter = countingLimiter();
    let allowed = 0;
    for (let call = 0; call < 700; call += 1) {
      if ((await hits(limiter, "view", call % 2 === 0 ? null : `192.0.2.${String(call % 250)}`)).allowed) allowed += 1;
    }
    expect(allowed).toBeLessThanOrEqual(600);
    expect(limiter.keys).toContain(`form-view-agency:${KEY}`);
    const other = countingLimiter();
    let fromOne = 0;
    for (let call = 0; call < 70; call += 1) {
      if ((await hits(other, "view", "192.0.2.9", String(call).padStart(38, "V"))).allowed) fromOne += 1;
    }
    expect(fromOne).toBe(60);
  });
});
