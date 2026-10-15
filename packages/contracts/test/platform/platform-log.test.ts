// The platform log's contract: pages are bounded, a filter names one organization, and unknown keys are refused.
import { describe, expect, it } from "vitest";
import { listPlatformLogInput, platformLogEntry } from "../../src/platform/index.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000c1";

describe("platform log contracts", () => {
  it("lists 50 entries by default, 1 to 100 when asked, and one organization's when given", () => {
    expect(listPlatformLogInput.parse({})).toEqual({ limit: 50 });
    expect(listPlatformLogInput.parse({ targetOrganizationId: organizationId, limit: 100 })).toEqual({
      targetOrganizationId: organizationId,
      limit: 100,
    });
    expect(listPlatformLogInput.safeParse({ limit: 101 }).success).toBe(false);
    expect(listPlatformLogInput.safeParse({ targetOrganizationId: "SHARMA" }).success).toBe(false);
    expect(listPlatformLogInput.safeParse({ action: "organization.onboarded" }).success).toBe(false);
  });

  it("describes an entry by a job, about an organization that may be gone", () => {
    const entry = {
      id: "0199e7a0-0000-7000-8000-0000000000c2",
      occurredAt: "2026-10-16T03:30:00.000Z",
      actorUserId: null,
      action: "organization.purged",
      targetType: "organization",
      targetId: organizationId,
      targetOrganizationId: organizationId,
      before: { code: "SHARMA" },
      after: null,
    };
    expect(platformLogEntry.parse(entry)).toEqual(entry);
  });
});
