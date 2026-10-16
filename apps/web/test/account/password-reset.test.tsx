// Resetting a forgotten password by email (spec 6.2): the request always gets the same answer, the link's token
// sets the new password, and an expired or used link says so and offers a new one. A reset ends every session, so
// this device forgets the person's data and the app's other tabs are told. Each outcome takes the focus.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "@/account/forgot-password-form";
import { ResetPasswordForm } from "@/account/reset-password-form";
import { announceSignOut, wipeLocalData } from "@/data/session";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

vi.mock("@/data/session", () => ({ wipeLocalData: vi.fn(), announceSignOut: vi.fn() }));

const { account, errors } = messages;

beforeEach(() => {
  vi.mocked(wipeLocalData).mockReset().mockResolvedValue(undefined);
  vi.mocked(announceSignOut).mockReset();
});

/**
 * An outcome is announced one way: as a heading that takes focus. It isn't also role="alert", which would read it to
 * a screen reader a second time.
 */
function expectAnnouncedOnce(text: string): void {
  expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: text }));
  expect(screen.queryByRole("alert")).toBeNull();
}

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
    expectAnnouncedOnce(account.forgotPassword.sent);
  });

  it("shows the instruction and the staff note only until the link is sent", async () => {
    renderScreen(<ForgotPasswordForm auth={{ requestPasswordReset: answers(ok(null)) }} />);
    expect(screen.getByText(account.forgotPassword.intro)).toBeVisible();
    expect(screen.getByText(account.forgotPassword.noEmail)).toBeVisible();
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: account.forgotPassword.submit }));
    await screen.findByText(account.forgotPassword.sent);
    expect(screen.queryByText(account.forgotPassword.intro)).toBeNull();
    expect(screen.queryByText(account.forgotPassword.noEmail)).toBeNull();
  });

  it("says reset by email isn't available while the api can't send it", async () => {
    const requestPasswordReset = answers(refused(400, "RESET_PASSWORD_DISABLED"));
    renderScreen(<ForgotPasswordForm auth={{ requestPasswordReset }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha@example.in");
    await userEvent.click(screen.getByRole("button", { name: account.forgotPassword.submit }));
    expect(await screen.findByText(errors.auth.RESET_PASSWORD_DISABLED)).toBeVisible();
  });
});

async function saveNewPassword() {
  await userEvent.type(screen.getByLabelText(account.fields.newPassword), "a-brand-new-password");
  await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), "a-brand-new-password");
  await userEvent.click(screen.getByRole("button", { name: account.resetPassword.submit }));
}

describe("ResetPasswordForm", () => {
  it("sets the new password with the link's token, then forgets the person here and in other tabs", async () => {
    const resetPassword = answers(ok(null));
    renderScreen(<ResetPasswordForm token="token-1" auth={{ resetPassword }} />);
    await saveNewPassword();
    expect(resetPassword).toHaveBeenCalledWith({ token: "token-1", newPassword: "a-brand-new-password" });
    expect(await screen.findByText(account.resetPassword.done)).toBeVisible();
    expectAnnouncedOnce(account.resetPassword.done);
    expect(screen.getByRole("link", { name: account.resetPassword.signIn })).toHaveAttribute("href", "/sign-in");
    expect(wipeLocalData).toHaveBeenCalledOnce();
    expect(announceSignOut).toHaveBeenCalledOnce();
  });

  it("still says the password changed when this device's storage refuses the wipe", async () => {
    vi.mocked(wipeLocalData).mockRejectedValueOnce(new DOMException("IndexedDB is blocked", "InvalidStateError"));
    renderScreen(<ResetPasswordForm token="token-1" auth={{ resetPassword: answers(ok(null)) }} />);
    await saveNewPassword();
    expect(await screen.findByText(account.resetPassword.done)).toBeVisible();
    expect(announceSignOut).toHaveBeenCalledOnce();
  });

  it("offers a new link when this one expired, before or after typing", async () => {
    const { unmount } = renderScreen(<ResetPasswordForm token={null} auth={{ resetPassword: answers(ok(null)) }} />);
    expect(screen.getByText(account.resetPassword.invalidLink)).toBeVisible();
    unmount();
    const resetPassword = answers(refused(400, "INVALID_TOKEN"));
    renderScreen(<ResetPasswordForm token="used" auth={{ resetPassword }} />);
    await saveNewPassword();
    expect(await screen.findByRole("link", { name: account.resetPassword.askAgain })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expectAnnouncedOnce(account.resetPassword.invalidLink);
    expect(wipeLocalData).not.toHaveBeenCalled();
    expect(announceSignOut).not.toHaveBeenCalled();
  });
});
