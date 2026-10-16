// An organization's member as the console shows them: a real address or none, never a staff placeholder, which fails
// the response instead of reaching a screen; the last activity an instant or none.
import { describe, expect, it } from "vitest";
import { organizationMember } from "../../src/platform/index.js";

const member = {
  memberId: "0199e7a0-0000-7000-8000-0000000000e1",
  userId: "0199e7a0-0000-7000-8000-0000000000e2",
  name: "Asha Sharma",
  roleName: "Owner",
  isOwner: true,
  email: "asha@example.test",
  hasPassword: false,
  lastActiveAt: null,
};

describe("organization member contract", () => {
  it("shows a real address, or none for staff without email", () => {
    expect(organizationMember.parse(member)).toEqual(member);
    expect(
      organizationMember.parse({ ...member, email: null, lastActiveAt: "2026-10-16T03:30:00.000Z" }),
    ).toMatchObject({
      email: null,
      lastActiveAt: "2026-10-16T03:30:00.000Z",
    });
  });

  it("refuses a placeholder address", () => {
    expect(organizationMember.safeParse({ ...member, email: "sharma-ravi@no-email.invalid" }).success).toBe(false);
  });
});
