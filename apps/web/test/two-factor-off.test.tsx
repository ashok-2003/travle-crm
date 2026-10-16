// Two-factor off (@travel-crm/contracts/features, the owner's 2026-10-16 ruling): no screen shows any of it, whatever
// the stored rows say. Your account has no two-factor row, Settings no requirement, the staff list no two-factor
// column, the console's staff list no state and its words no mention of it, and the setup and code pages send people
// home and to sign-in.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as Navigation from "next/navigation";
import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountScreen } from "@/account/account-screen";
import TwoFactorPage from "@/app/(account)/sign-in/two-factor/page";
import TwoFactorSetupPage from "@/app/(account)/two-factor-setup/page";
import { PasswordHandover } from "@/console/staff/password-handover";
import { StaffScreen } from "@/console/staff/staff-screen";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { SettingsScreen } from "@/organization/settings/settings-screen";
import { StaffList } from "@/organization/staff/staff-list";
import { MeProvider } from "@/session/me-context";
import { renderScreen } from "./account/render";
import { arjun, kavita, viewer } from "./console/staff/people";
import { renderAs, screenIs } from "./organization/render";
import { stubApi } from "./support/api-stub";
import { member } from "./support/members";
import { renderConsole } from "./support/render-console";

// Off, as the product ships it, whatever the constant says today: these tests prove what the switch turns off.
vi.mock("@travel-crm/contracts/features", () => ({ features: { twoFactor: false } }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof Navigation>()),
  redirect: vi.fn(),
}));

const TWO_FACTOR = /two-factor|authenticator/i;

/** An Owner whose stored rows say two-factor is on and required, as they were left while it was on. */
function ownerWithTwoFactor() {
  const owner = member({ isOwner: true });
  owner.user.twoFactorEnabled = true;
  owner.organization.requireTwoFactor = true;
  return owner;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("two-factor off", () => {
  it("leaves the two-factor row out of Your account", () => {
    renderScreen(
      <MeProvider me={ownerWithTwoFactor()}>
        <AccountScreen />
      </MeProvider>,
    );
    expect(screen.getByRole("link", { name: messages.account.account.changePassword })).toBeVisible();
    expect(screen.queryByText(messages.account.account.twoFactor)).toBeNull();
    expect(document.body).not.toHaveTextContent(TWO_FACTOR);
  });

  it("leaves the requirement out of Settings", () => {
    renderAs(<SettingsScreen />, ownerWithTwoFactor());
    expect(screen.getByRole("heading", { name: messages.settings.organization.heading })).toBeVisible();
    expect(screen.queryByRole("heading", { name: messages.settings.security.heading })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(document.body).not.toHaveTextContent(TWO_FACTOR);
  });

  it("leaves the two-factor column out of the staff list", () => {
    screenIs("wide");
    const owner = ownerWithTwoFactor();
    const staff: StaffMember[] = [
      {
        memberId: owner.member.memberId,
        userId: owner.user.id,
        name: "Asha",
        email: "asha@sharma.in",
        username: null,
        role: { key: "org-owner", name: "Owner" },
        twoFactorEnabled: true,
        mustChangePassword: false,
        joinedAt: "2026-01-02T05:00:00.000Z",
      },
    ];
    const roles: RoleSummary[] = [{ key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 }];
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).not.toContain(
      messages.staff.columns.twoFactor,
    );
    expect(within(screen.getByRole("row", { name: /Asha/ })).queryByText(messages.staff.twoFactorOn)).toBeNull();
  });

  it("shows no two-factor state in the console's staff list, and its words never mention it", async () => {
    screenIs("wide");
    const words = messages.consolePlatform.staff;
    stubApi({ "platform.platformStaff.list": { data: [kavita, arjun] } });
    renderConsole(<StaffScreen />, viewer);
    const newcomer = within(await screen.findByRole("row", { name: /Arjun Nair/ }));
    expect(newcomer.getByText(words.mustReplacePassword)).toBeVisible();
    expect(newcomer.queryByText(words.twoFactorOff)).toBeNull();
    expect(within(screen.getByRole("row", { name: /Kavita Rao/ })).queryByText(words.twoFactorOn)).toBeNull();
    expect(screen.getByText(words.intro)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: words.add }));
    expect(screen.getByRole("dialog", { name: words.addForm.title })).toHaveAccessibleDescription(
      words.addForm.description,
    );
    expect(document.body).not.toHaveTextContent(TWO_FACTOR);
  });

  it("hands a newcomer their details without asking them to set up two-factor", () => {
    renderConsole(<PasswordHandover email="neha@platform.test" password="temporary-1" intro="Give Neha these:" />);
    expect(screen.getByText(messages.consolePlatform.staff.handover.firstSignIn)).toBeVisible();
    expect(document.body).not.toHaveTextContent(TWO_FACTOR);
  });

  it("sends the setup page home and the code page to sign-in", () => {
    TwoFactorSetupPage();
    expect(redirect).toHaveBeenLastCalledWith(routes.home);
    TwoFactorPage();
    expect(redirect).toHaveBeenLastCalledWith(routes.signIn);
  });
});
