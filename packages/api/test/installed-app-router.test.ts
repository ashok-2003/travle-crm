// usage.installedAppSeen and usage.installedApps: every member may note and read their own, in any subscription state;
// the input names a known phone type and nothing else.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anAgency, callerOf, createHarness, refusal, type Harness } from "./forms-support.js";

describe("usage.installedApps", () => {
  let harness: Harness;
  beforeAll(() => {
    harness = createHarness();
  });
  afterAll(() => harness.close());

  it("lets a member with no permissions note the installed app and read it back, only their own", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId, granted: [] });
    const { caller: colleague } = callerOf(harness, { organizationId, granted: [] });
    expect(await caller.usage.installedApps()).toEqual({ platforms: [] });
    await caller.usage.installedAppSeen({ platform: "android" });
    await caller.usage.installedAppSeen({ platform: "android" });
    expect(await caller.usage.installedApps()).toEqual({ platforms: ["android"] });
    expect(await colleague.usage.installedApps()).toEqual({ platforms: [] });
  });

  it("refuses an unknown phone type and extra keys", async () => {
    const organizationId = await anAgency(harness);
    const { caller } = callerOf(harness, { organizationId });
    expect(await refusal(caller.usage.installedAppSeen({ platform: "windows" } as never))).toBe("BAD_REQUEST");
    expect(await refusal(caller.usage.installedAppSeen({ platform: "ios", userId: "x" } as never))).toBe("BAD_REQUEST");
  });
});
