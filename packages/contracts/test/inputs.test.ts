// The identity inputs reject what the API must never receive: staff with no way to sign in, repeated permissions,
// and scopes other than own or all.
import { describe, expect, it } from "vitest";
import {
  createRoleInput,
  createStaffInput,
  orgSignInInput,
  setTwoFactorRequirementInput,
  staffRemovedEvent,
  updateRoleInput,
} from "../src/identity/index.js";

describe("identity inputs", () => {
  const staff = { name: "Ravi Kumar", roleKey: "sales", temporaryPassword: "temporary-pass-1" };

  it("creates staff with an email, a username or both, but not neither", () => {
    expect(createStaffInput.safeParse({ ...staff, email: "ravi@sharma.in" }).success).toBe(true);
    expect(createStaffInput.safeParse({ ...staff, username: "ravi" }).success).toBe(true);
    expect(createStaffInput.safeParse({ ...staff, email: "ravi@sharma.in", username: "ravi" }).success).toBe(true);
    const neither = createStaffInput.safeParse(staff);
    expect(neither.success).toBe(false);
    expect(neither.error?.issues[0]?.path).toEqual(["username"]);
  });

  it("accepts each permission once, with an own or all scope", () => {
    const viewOwn = { permission: "leads:view", scope: "own" };
    expect(createRoleInput.safeParse({ name: "Sales", permissions: [viewOwn] }).success).toBe(true);
    expect(createRoleInput.safeParse({ name: "Sales", permissions: [viewOwn, viewOwn] }).success).toBe(false);
    expect(
      createRoleInput.safeParse({ name: "Sales", permissions: [{ permission: "leads:view", scope: "team" }] }).success,
    ).toBe(false);
    expect(createRoleInput.safeParse({ name: "Sales", permissions: [{ permission: "Leads View" }] }).success).toBe(
      false,
    );
  });

  it("names roles with 1 to 40 characters, in any script", () => {
    expect(createRoleInput.parse({ name: "  बिक्री टीम ", permissions: [] }).name).toBe("बिक्री टीम");
    expect(createRoleInput.safeParse({ name: "   ", permissions: [] }).success).toBe(false);
    expect(createRoleInput.safeParse({ name: "x".repeat(41), permissions: [] }).success).toBe(false);
  });

  it("updates a role's name, permissions, or both, but not nothing", () => {
    expect(updateRoleInput.safeParse({ key: "sales" }).success).toBe(false);
    expect(updateRoleInput.safeParse({ key: "sales", name: "Sales" }).success).toBe(true);
    expect(updateRoleInput.safeParse({ key: "sales", permissions: [] }).success).toBe(true);
    expect(updateRoleInput.safeParse({ key: "Sales", name: "Sales" }).success).toBe(false);
  });

  it("carries only the member's and user's ids in staff.removed", () => {
    const ids = { memberId: "0199e7a0-0000-7000-8000-000000000001", userId: "0199e7a0-0000-7000-8000-000000000002" };
    expect(staffRemovedEvent.parse(ids)).toEqual(ids);
    expect(staffRemovedEvent.safeParse({ ...ids, email: "ravi@sharma.in" }).success).toBe(false);
    expect(staffRemovedEvent.safeParse({ memberId: ids.memberId }).success).toBe(false);
  });

  it("refuses unknown keys instead of dropping them", () => {
    expect(updateRoleInput.safeParse({ key: "sales", permisions: [] }).success).toBe(false);
    expect(createStaffInput.safeParse({ ...staff, username: "ravi", orgId: "x" }).success).toBe(false);
    expect(orgSignInInput.safeParse({ orgCode: "SHARMA", username: "Ravi", password: "x", extra: 1 }).success).toBe(
      false,
    );
    expect(setTwoFactorRequirementInput.safeParse({ required: true, other: 1 }).success).toBe(false);
  });

  it("refuses permission keys longer than 64 characters", () => {
    const permission = `${"a".repeat(32)}:${"b".repeat(32)}`;
    expect(createRoleInput.safeParse({ name: "Sales", permissions: [{ permission }] }).success).toBe(false);
  });

  it("normalises the organization code typed at sign-in", () => {
    expect(orgSignInInput.parse({ orgCode: "sharma", username: "Ravi", password: "x" })).toEqual({
      orgCode: "SHARMA",
      username: "Ravi",
      password: "x",
    });
  });
});
