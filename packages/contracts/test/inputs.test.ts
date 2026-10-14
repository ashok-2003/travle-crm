// The identity inputs reject what the API must never receive: staff with no way to sign in, repeated permissions,
// and scopes other than own or all.
import { describe, expect, it } from "vitest";
import { createRoleInput, createStaffInput, orgSignInInput, updateRoleInput } from "../src/identity/index.js";

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

  it("updates a role's name, permissions, or both", () => {
    expect(updateRoleInput.parse({ key: "sales" })).toEqual({ key: "sales" });
    expect(updateRoleInput.safeParse({ key: "Sales" }).success).toBe(false);
  });

  it("normalises the organization code typed at sign-in", () => {
    expect(orgSignInInput.parse({ orgCode: "sharma", username: "Ravi", password: "x" })).toEqual({
      orgCode: "SHARMA",
      username: "Ravi",
      password: "x",
    });
  });
});
