// @vitest-environment node
// The scope of a view permission the member holds, for screens that differ by it (Mine/Everyone, R42): all for an
// Owner, the role's own scope otherwise, and none without the permission.
import { describe, expect, it } from "vitest";
import { viewScope, type SignedInMember } from "@/session/me-context";
import { member } from "../support/members";

const withGrant = (scope: "own" | "all"): SignedInMember => {
  const me = member();
  return { ...me, member: { ...me.member, permissions: [{ permission: "leads:view", scope }] } };
};

describe("viewScope", () => {
  it("is all for an Owner, the grant's scope for a role, and null without the permission", () => {
    expect(viewScope(member({ isOwner: true }), "leads:view")).toBe("all");
    expect(viewScope(withGrant("all"), "leads:view")).toBe("all");
    expect(viewScope(withGrant("own"), "leads:view")).toBe("own");
    expect(viewScope(member({ permissions: ["staff:manage"] }), "leads:view")).toBeNull();
    expect(viewScope(withGrant("all"), "quotes:view")).toBeNull();
  });
});
