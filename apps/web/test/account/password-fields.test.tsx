// Every password a person types can be shown before it is sent (the owner's ask), and a form sends the same password
// whether it is shown or hidden. A temporary password an admin hands over is shown anyway, so it has no button.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/account/change-password-form";
import { CodeSignInForm } from "@/account/code-sign-in-form";
import { EmailSignInForm } from "@/account/email-sign-in-form";
import { ResetPasswordForm } from "@/account/reset-password-form";
import { TurnOffTwoFactor } from "@/account/turn-off-two-factor";
import { TwoFactorSetup } from "@/account/two-factor-setup";
import { messages } from "@/i18n/messages";
import { answers, ok, renderScreen } from "./render";

const { account, common } = messages;

const forms: [string, ReactElement, number][] = [
  ["email sign-in", <EmailSignInForm key="email" onSignedIn={vi.fn()} auth={{ signInWithEmail: vi.fn() }} />, 1],
  [
    "code sign-in",
    <CodeSignInForm key="code" rememberedCode={null} onSignedIn={vi.fn()} auth={{ signInWithCode: vi.fn() }} />,
    1,
  ],
  [
    "change password",
    <ChangePasswordForm key="change" temporary={false} onChanged={vi.fn()} auth={{ changePassword: vi.fn() }} />,
    3,
  ],
  ["reset password", <ResetPasswordForm key="reset" token="token" auth={{ resetPassword: vi.fn() }} />, 2],
  [
    "two-factor setup",
    <TwoFactorSetup
      key="setup"
      askedBy={null}
      canLeave
      onDone={vi.fn()}
      auth={{ startTwoFactorSetup: vi.fn(), confirmTwoFactor: vi.fn() }}
    />,
    1,
  ],
];

describe("password fields", () => {
  it.each(forms)("%s: every password field has its own show/hide button", (_name, form, count) => {
    const { container } = renderScreen(form);
    const fields = [...container.querySelectorAll("input[type=password]")];
    expect(fields).toHaveLength(count);
    for (const field of fields) {
      const group = field.closest("[data-slot=input-group]");
      expect(group, field.id).not.toBeNull();
      expect(within(group as HTMLElement).getByRole("button", { name: common.showPassword })).toBeVisible();
    }
  });

  it("turning two-factor off: the password has the button too", async () => {
    renderScreen(<TurnOffTwoFactor onTurnedOff={vi.fn()} auth={{ turnOffTwoFactor: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button", { name: account.account.turnOff }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(account.fields.password)).toHaveAttribute("type", "password");
    expect(within(dialog).getByRole("button", { name: common.showPassword })).toBeVisible();
  });

  it("keeps the browser's autocomplete hints", () => {
    renderScreen(<ChangePasswordForm temporary={false} onChanged={vi.fn()} auth={{ changePassword: vi.fn() }} />);
    expect(screen.getByLabelText(account.fields.currentPassword)).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText(account.fields.newPassword)).toHaveAttribute("autocomplete", "new-password");
  });

  it("sends the password typed, shown or not", async () => {
    const signInWithEmail = answers(ok({ twoFactorRequired: false }));
    renderScreen(<EmailSignInForm onSignedIn={vi.fn()} auth={{ signInWithEmail }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha@example.in");
    await userEvent.type(screen.getByLabelText(account.fields.password), "owner-");
    await userEvent.click(screen.getByRole("button", { name: common.showPassword }));
    await userEvent.type(screen.getByLabelText(account.fields.password), "password-1");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(signInWithEmail).toHaveBeenCalledWith({ email: "asha@example.in", password: "owner-password-1" });
  });

  it("still shows an error under a password field, and marks it invalid", async () => {
    renderScreen(<EmailSignInForm onSignedIn={vi.fn()} auth={{ signInWithEmail: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    const password = screen.getByLabelText(account.fields.password);
    expect(await screen.findAllByText(account.fields.required)).toHaveLength(2);
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription(account.fields.required);
  });
});
