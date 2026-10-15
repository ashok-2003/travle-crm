// Resetting a forgotten password by email (spec 6.2): the request always gets the same answer, the link's token
// sets the new password, and an expired or used link says so and offers a new one.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ForgotPasswordForm } from "@/account/forgot-password-form";
import { ResetPasswordForm } from "@/account/reset-password-form";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const { account, errors } = messages;

describe("ForgotPasswordForm", () => {
  it("asks for a link that leads back to the reset screen, and answers the same for any address", async () => {
    const requestPasswordReset = answers(ok(null));
    renderScreen(<ForgotPasswordForm auth={{ requestPasswordReset }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "Asha@Example.in");
    await userEvent.click(screen.getByRole("button", { name: account.forgotPassword.submit }));
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "asha@example.in",
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(await screen.findByText(account.forgotPassword.sent)).toBeVisible();
  });

  it("says reset by email isn't available while the api can't send it", async () => {
    const requestPasswordReset = answers(refused(400, "RESET_PASSWORD_DISABLED"));
    renderScreen(<ForgotPasswordForm auth={{ requestPasswordReset }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: account.forgotPassword.submit }));
    expect(await screen.findByText(errors.auth.RESET_NOT_AVAILABLE)).toBeVisible();
  });
});

describe("ResetPasswordForm", () => {
  it("sets the new password with the link's token", async () => {
    const resetPassword = answers(ok(null));
    renderScreen(<ResetPasswordForm token="token-1" auth={{ resetPassword }} />);
    await userEvent.type(screen.getByLabelText(account.fields.newPassword), "a-brand-new-password");
    await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), "a-brand-new-password");
    await userEvent.click(screen.getByRole("button", { name: account.resetPassword.submit }));
    expect(resetPassword).toHaveBeenCalledWith({ token: "token-1", newPassword: "a-brand-new-password" });
    expect(await screen.findByText(account.resetPassword.done)).toBeVisible();
    expect(screen.getByRole("link", { name: account.resetPassword.signIn })).toHaveAttribute("href", "/sign-in");
  });

  it("offers a new link when this one expired, before or after typing", async () => {
    const { unmount } = renderScreen(<ResetPasswordForm token={null} auth={{ resetPassword: answers(ok(null)) }} />);
    expect(screen.getByText(account.resetPassword.invalidLink)).toBeVisible();
    unmount();
    const resetPassword = answers(refused(400, "INVALID_TOKEN"));
    renderScreen(<ResetPasswordForm token="used" auth={{ resetPassword }} />);
    await userEvent.type(screen.getByLabelText(account.fields.newPassword), "a-brand-new-password");
    await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), "a-brand-new-password");
    await userEvent.click(screen.getByRole("button", { name: account.resetPassword.submit }));
    expect(await screen.findByRole("link", { name: account.resetPassword.askAgain })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
