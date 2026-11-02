// The dashboard's bounded-concurrency map: order kept, the limit held, and a stop at the first failure.
import { describe, expect, it } from "vitest";
import { mapConcurrently } from "../../src/platform/map-concurrently.js";

const later = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("mapConcurrently", () => {
  it("keeps the input order when items finish out of order", async () => {
    const result = await mapConcurrently([30, 1, 15, 2], 4, async (ms) => {
      await later(ms);
      return ms;
    });
    expect(result).toEqual([30, 1, 15, 2]);
  });

  it("runs all seven items with never more than three at once", async () => {
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    await mapConcurrently([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      started.push(item);
      active += 1;
      peak = Math.max(peak, active);
      await later(5);
      active -= 1;
    });
    expect(started.toSorted()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it("rejects with the first error and starts nothing after a failure", async () => {
    const started: number[] = [];
    const boom = new Error("boom");
    await expect(
      mapConcurrently([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
        started.push(item);
        if (item === 2) throw boom;
        await later(5);
        if (item === 3) throw new Error("later failure");
        return item;
      }),
    ).rejects.toBe(boom);
    // The first three were in flight; the failures stop the lanes from taking items 4 to 7.
    expect(started).toEqual([1, 2, 3]);
  });

  it("handles an empty list", async () => {
    expect(await mapConcurrently([], 3, () => Promise.resolve(1))).toEqual([]);
  });
});
