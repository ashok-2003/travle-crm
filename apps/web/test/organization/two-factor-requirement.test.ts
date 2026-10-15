// Anyone who may change settings can require two-factor sign-in; only an Owner can stop requiring it (spec 6.2).
import { describe, expect, it } from "vitest";
import { requirementSwitch } from "@/organization/settings/two-factor-requirement-rules";

describe("requirementSwitch", () => {
  it("lets anyone with settings:manage turn the requirement on", () => {
    expect(requirementSwitch({ required: false, isOwner: false })).toEqual({ disabled: false, reason: null });
  });

  it("lets only an Owner turn it off, and says why to everyone else", () => {
    expect(requirementSwitch({ required: true, isOwner: true })).toEqual({ disabled: false, reason: null });
    expect(requirementSwitch({ required: true, isOwner: false })).toEqual({ disabled: true, reason: "ownerOnly" });
  });
});
