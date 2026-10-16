// The reset screen reads the emailed link's token once, then takes it out of the address bar (ADR 0006), so it isn't
// left in the history or sent on as a Referer. Saving still uses the token it read.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordScreen } from "@/account/reset-password-screen";
import { messages } from "@/i18n/messages";
import { answers, ok, renderScreen } from "./render";

vi.mock("@/data/session", () => ({ wipeLocalData: vi.fn(() => Promise.resolve()), announceSignOut: vi.fn() }));

// Next patches history.replaceState so that useSearchParams follows it (next/dist/client/components/app-router.js:302).
// This stand-in does the same, so the screen sees the address lose its token, as it does in a browser.
const historyListeners = new Set<() => void>();
const replaceState = window.history.replaceState.bind(window.history);
window.history.replaceState = (...parameters) => {
  replaceState(...parameters);
  for (const listener of historyListeners) listener();
};
function onHistoryChange(listener: () => void): () => void {
  historyListeners.add(listener);
  return () => historyListeners.delete(listener);
}
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(onHistoryChange, () => window.location.search)),
}));

const { account } = messages;

beforeEach(() => {
  replaceState(null, "", "/reset-password?token=token-1");
});

async function saveNewPassword() {
  await userEvent.type(screen.getByLabelText(account.fields.newPassword), "a-brand-new-password");
  await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), "a-brand-new-password");
  await userEvent.click(screen.getByRole("button", { name: account.resetPassword.submit }));
}

describe("ResetPasswordScreen", () => {
  it("takes the token out of the address bar once it has read it", () => {
    renderScreen(<ResetPasswordScreen auth={{ resetPassword: answers(ok(null)) }} />);
    expect(window.location.pathname + window.location.search).toBe("/reset-password");
  });

  it("saves the new password with the token it read, though the address no longer has it", async () => {
    const resetPassword = answers(ok(null));
    renderScreen(<ResetPasswordScreen auth={{ resetPassword }} />);
    await saveNewPassword();
    expect(resetPassword).toHaveBeenCalledWith({ token: "token-1", newPassword: "a-brand-new-password" });
    expect(await screen.findByText(account.resetPassword.done)).toBeVisible();
  });

  it("says when the link had expired, and tidies the address too", () => {
    replaceState(null, "", "/reset-password?error=INVALID_TOKEN");
    renderScreen(<ResetPasswordScreen auth={{ resetPassword: answers(ok(null)) }} />);
    expect(screen.getByText(account.resetPassword.invalidLink)).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: account.resetPassword.invalidTitle })).toBeVisible();
    expect(window.location.search).toBe("");
  });

  it("titles the page by what it holds: the form, then the saved password", async () => {
    renderScreen(<ResetPasswordScreen auth={{ resetPassword: answers(ok(null)) }} />);
    expect(screen.getByRole("heading", { level: 1, name: account.resetPassword.title })).toBeVisible();
    await userEvent.type(screen.getByLabelText(account.fields.newPassword), "a-long-new-password");
    await userEvent.type(screen.getByLabelText(account.fields.confirmPassword), "a-long-new-password");
    await userEvent.click(screen.getByRole("button", { name: account.resetPassword.submit }));
    expect(await screen.findByRole("heading", { level: 1, name: account.resetPassword.doneTitle })).toBeVisible();
  });
});
