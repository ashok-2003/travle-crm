// A schedule pg-boss keeps across restarts outlives the code that used it: the worker unschedules the retired ones at start.
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { describe, expect, it } from "vitest";
import { RETIRED_SCHEDULES, retireSchedules } from "../src/worker-jobs.js";

describe("retired schedules", () => {
  it("names the earlier agent's nightly lessons", () => {
    expect(RETIRED_SCHEDULES).toContain("ai.learn");
  });

  it("are removed at start, and the live ones stay", async () => {
    const runner = createMemoryJobRunner(createMemoryJobQueue());
    await runner.schedule("ai.learn", "30 2 * * *", { timeZone: "Asia/Kolkata" });
    await runner.schedule("ai.nudges", "* * * * *", { timeZone: "Asia/Kolkata" });
    await retireSchedules(runner);
    expect(runner.schedules.map((schedule) => schedule.queue)).toEqual(["ai.nudges"]);
    // Nothing scheduled any more is no error.
    await retireSchedules(runner);
  });
});
