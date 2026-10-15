// Changing a password: the new one twice, at least 10 characters, and the current one checked by the api. Once it is
// saved, a next screen that doesn't open leaves the person a way on, never the form again.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/account/change-password-form";
import { messages } from "@/i18n/messages";
import { unanswered } from "../support/api-errors";
import { answers, ok, refused, renderScreen } from "./render";

const { account, common, errors } = messages;

async function fill(current: string, chosen: string, again: string) {
  await userEvent.type(screen.getByLabelText(account.fields.temporaryPassword), current);
  await userEvent.type(screen.getByLabelText(account.fields.newPassword), chosen);
  await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), again);
  await userEvent.click(screen.getByRole("button", { name: account.changePassword.submit }));
}

describe("ChangePasswordForm", () => {
  it("asks for the new password twice, and long enough, before sending", async () => {
    const changePassword = answers(ok(null));
    renderScreen(<ChangePasswordForm temporary onChanged={vi.fn()} auth={{ changePassword }} />);
    await fill("temporary-1", "short", "different");
    expect(await screen.findByText(account.fields.passwordTooShort)).toBeVisible();
    expect(screen.getByText(account.fields.passwordsDiffer)).toBeVisible();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("sends the current and new passwords, then moves on", async () => {
    const changePassword = answers(ok(null));
    const onChanged = vi.fn();
    renderScreen(<ChangePasswordForm temporary onChanged={onChanged} auth={{ changePassword }} />);
    await fill("temporary-1", "my-own-password", "my-own-password");
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: "temporary-1", newPassword: "my-own-password" });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("says when the current password is wrong", async () => {
    const changePassword = answers(refused(400, "INVALID_PASSWORD"));
    const onChanged = vi.fn();
    renderScreen(<ChangePasswordForm temporary onChanged={onChanged} auth={{ changePassword }} />);
    await fill("wrong", "my-own-password", "my-own-password");
    expect(await screen.findByText(errors.auth.INVALID_PASSWORD)).toBeVisible();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("says the password is saved when the next screen doesn't open, and continues from there", async () => {
    const changePassword = answers(ok(null));
    const onChanged = vi.fn().mockRejectedValueOnce(unanswered()).mockResolvedValueOnce(undefined);
    renderScreen(<ChangePasswordForm temporary onChanged={onChanged} auth={{ changePassword }} />);
    await fill("temporary-1", "my-own-password", "my-own-password");
    expect(await screen.findByText(account.changePassword.savedNotContinued)).toBeVisible();
    // Announced once: a focused heading, not role="alert" as well.
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 2, name: account.changePassword.savedNotContinued }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText(account.fields.temporaryPassword)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: common.continue }));
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(changePassword).toHaveBeenCalledOnce();
  });
});
