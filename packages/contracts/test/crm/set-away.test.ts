// Being away from the turns is bounded (release 4): a time at most 30 days ahead, or back (null).
import { describe, expect, it } from "vitest";
import { setAwayInput } from "../../src/crm/index.js";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("setAwayInput", () => {
  it("takes back, and a time up to 30 days ahead", () => {
    expect(setAwayInput.safeParse({ awayUntil: null }).success).toBe(true);
    expect(setAwayInput.safeParse({ awayUntil: inDays(7) }).success).toBe(true);
    expect(setAwayInput.safeParse({ awayUntil: inDays(30) }).success).toBe(true);
  });

  it("refuses a time further ahead", () => {
    expect(setAwayInput.safeParse({ awayUntil: inDays(31) }).success).toBe(false);
    expect(setAwayInput.safeParse({ awayUntil: "9999-01-01T00:00:00.000Z" }).success).toBe(false);
  });
});
