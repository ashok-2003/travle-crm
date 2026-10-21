// The add-staff form keeps plain text; the api's own schema decides what's valid, and each problem is shown on the
// field it belongs to.
import { describe, expect, it } from "vitest";
import { toCreateStaffInput, type CreateStaffValues } from "@/organization/staff/create-staff-values";

const values: CreateStaffValues = {
  name: "Ravi Kumar",
  email: "",
  username: "ravi",
  phone: "",
  roleKey: "sales",
  temporaryPassword: "temporary-1",
};

describe("toCreateStaffInput", () => {
  it("leaves blank fields out, so staff without email are allowed", () => {
    expect(toCreateStaffInput(values)).toEqual({
      ok: true,
      input: { name: "Ravi Kumar", username: "ravi", roleKey: "sales", temporaryPassword: "temporary-1" },
    });
    expect(toCreateStaffInput({ ...values, email: " Ravi@Sharma.in ", username: "  " })).toEqual({
      ok: true,
      input: { name: "Ravi Kumar", email: "ravi@sharma.in", roleKey: "sales", temporaryPassword: "temporary-1" },
    });
  });

  it("asks for an email or a username when both are blank", () => {
    expect(toCreateStaffInput({ ...values, username: "" })).toEqual({
      ok: false,
      problems: { username: "emailOrUsername" },
    });
  });

  it("puts each problem on its field", () => {
    expect(
      toCreateStaffInput({
        name: " ",
        email: "not-an-email",
        username: "r",
        phone: "123",
        roleKey: "",
        temporaryPassword: "short",
      }),
    ).toEqual({
      ok: false,
      problems: {
        name: "nameRequired",
        email: "emailInvalid",
        username: "usernameInvalid",
        phone: "phoneInvalid",
        roleKey: "roleRequired",
        temporaryPassword: "passwordTooShort",
      },
    });
  });

  it("refuses a placeholder address like any address that isn't real", () => {
    expect(toCreateStaffInput({ ...values, email: "someone@no-email.invalid" })).toEqual({
      ok: false,
      problems: { email: "emailInvalid" },
    });
  });
});
