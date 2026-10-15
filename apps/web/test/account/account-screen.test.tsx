// The account page shows the person's own details from me.get (no email for staff without one, and never a
// placeholder address), and offers turning two-factor off only when the organization doesn't require it.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountScreen } from "@/account/account-screen";
import { messages } from "@/i18n/messages";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { member } from "../support/members";
import { renderScreen } from "./render";

const { account } = messages.account;

function renderAccount(me: SignedInMember) {
  return renderScreen(
    <MeProvider me={me}>
      <AccountScreen />
    </MeProvider>,
  );
}

describe("AccountScreen", () => {
  it("shows a username and no email row for staff without email", () => {
    renderAccount(member());
    expect(screen.getByText("asha")).toBeVisible();
    expect(screen.queryByText(account.email)).toBeNull();
    expect(screen.getByRole("link", { name: account.changePassword })).toHaveAttribute("href", "/change-password");
  });

  it("never shows a placeholder email, even if one reached it", () => {
    const staff = member();
    staff.user.email = "asha.0199a000@staff.invalid";
    renderAccount(staff);
    expect(screen.queryByText(account.email)).toBeNull();
    expect(screen.queryByText(/\.invalid/)).toBeNull();
  });

  it("offers setting two-factor up while it is off", () => {
    renderAccount(member());
    expect(screen.getByText(account.twoFactorOff)).toBeVisible();
    expect(screen.getByRole("link", { name: account.setUp })).toHaveAttribute("href", "/two-factor-setup");
  });

  it("offers turning two-factor off, unless the organization requires it", () => {
    const on = member();
    on.user.twoFactorEnabled = true;
    const { unmount } = renderAccount(on);
    expect(screen.getByRole("button", { name: account.turnOff })).toBeVisible();
    unmount();
    renderAccount({ ...on, organization: { ...on.organization, requireTwoFactor: true } });
    expect(screen.queryByRole("button", { name: account.turnOff })).toBeNull();
    expect(screen.getByText(account.twoFactorRequired)).toBeVisible();
  });
});
