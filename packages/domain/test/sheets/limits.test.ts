// The check pace (S36, owner 2026-10-20): about every 15 minutes, each next check spread by up to a third more at random,
// a new connection's first check at a random moment within the first interval.
import { describe, expect, it } from "vitest";
import {
  checkIntervalSeconds,
  firstCheckSeconds,
  lateAfterMinutes,
  spreadCheckSeconds,
} from "../../src/sheets/limits.js";

describe("the check pace", () => {
  it("is fifteen minutes, and a sheet is late only after that and its spread", () => {
    expect(checkIntervalSeconds).toBe(900);
    expect(lateAfterMinutes * 60).toBeGreaterThan(checkIntervalSeconds + checkIntervalSeconds / 3);
  });

  it("spreads the next check by 0 to 5 minutes after the interval", () => {
    expect(spreadCheckSeconds(900, () => 0)).toBe(900);
    expect(spreadCheckSeconds(900, () => 0.5)).toBe(1050);
    expect(spreadCheckSeconds(900, () => 0.9999)).toBe(1199);
    for (let run = 0; run < 200; run += 1) {
      const seconds = spreadCheckSeconds();
      expect(seconds).toBeGreaterThanOrEqual(900);
      expect(seconds).toBeLessThan(1200);
    }
  });

  it("puts a new connection's first check within the first interval", () => {
    expect(firstCheckSeconds(900, () => 0)).toBe(0);
    expect(firstCheckSeconds(900, () => 0.5)).toBe(450);
    expect(firstCheckSeconds(900, () => 0.9999)).toBe(899);
  });
});
