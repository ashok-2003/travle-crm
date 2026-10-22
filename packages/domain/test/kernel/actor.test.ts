// The kernel's actors: the system, a platform admin and a visitor to a public form each name their source.
import { describe, expect, it } from "vitest";
import { publicActor } from "../../src/kernel/index.js";

describe("publicActor", () => {
  it("is source public with no user", () => {
    expect(publicActor("0199e7a0-0000-7000-8000-0000000000a1")).toEqual({
      organizationId: "0199e7a0-0000-7000-8000-0000000000a1",
      userId: null,
      source: "public",
      impersonatedBy: null,
    });
  });
});
