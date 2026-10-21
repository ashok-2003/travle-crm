// Staff are shown by what they sign in with, and never by the placeholder address staff without email carry.
import type { StaffMember } from "@travel-crm/contracts/identity";
import { describe, expect, it } from "vitest";
import { handoverSignInName, signInName, withRole } from "@/organization/staff/staff-details";

const ravi: StaffMember = {
  memberId: "0199a000-0000-7000-8000-00000000000a",
  userId: "0199a000-0000-7000-8000-00000000000b",
  name: "Ravi Kumar",
  email: null,
  username: "ravi",
  phone: null,
  role: { key: "sales", name: "Sales", isOwner: false },
  twoFactorEnabled: false,
  mustChangePassword: true,
  joinedAt: "2026-10-15T06:00:00.000Z",
};

describe("signInName", () => {
  it("is the email when there is one, else the username", () => {
    expect(signInName({ email: "ravi@sharma.in", username: "ravi" })).toBe("ravi@sharma.in");
    expect(signInName({ email: null, username: "ravi" })).toBe("ravi");
  });

  it("never shows a placeholder address, even if one reached the app", () => {
    expect(signInName({ email: "sharma-ravi@no-email.invalid", username: "ravi" })).toBe("ravi");
    expect(signInName({ email: "X@NO-EMAIL.INVALID", username: null })).toBe("");
  });
});

describe("handoverSignInName", () => {
  it("is the username when there is one, since that is what goes with the organization code", () => {
    expect(handoverSignInName({ email: "ravi@sharma.in", username: "ravi" })).toBe("ravi");
  });

  it("is a real email otherwise, and never a placeholder address", () => {
    expect(handoverSignInName({ email: "ravi@sharma.in", username: null })).toBe("ravi@sharma.in");
    expect(handoverSignInName({ email: "sharma-ravi@no-email.invalid", username: null })).toBeNull();
    expect(handoverSignInName({ email: null, username: null })).toBeNull();
  });
});

describe("withRole", () => {
  it("changes one person's role and leaves the rest as they were", () => {
    const meera = { ...ravi, memberId: "0199a000-0000-7000-8000-00000000000c", name: "Meera" };
    const changed = withRole([ravi, meera], ravi.memberId, { key: "operations", name: "Operations", isOwner: false });
    expect(changed[0]?.role).toEqual({ key: "operations", name: "Operations", isOwner: false });
    expect(changed[1]).toBe(meera);
    expect(ravi.role.key).toBe("sales");
  });
});
