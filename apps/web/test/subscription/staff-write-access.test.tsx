// The staff screen as the subscription allows (ADR 0021): read-only, adding staff and changing a role are shown
// disabled with the reason, while removing someone and a new password stay open; suspended, the Owner still sees the
// list and can remove someone though the roles list is refused; and a refusal that still happens says why.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import type { LifecycleAccess, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { StaffScreen } from "@/organization/staff/staff-screen";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { reasons } = messages.errors;
const owner = member({ isOwner: true });

const person = (memberId: string, name: string, role: StaffMember["role"]): StaffMember => ({
  memberId,
  userId: `${memberId}-user`,
  name,
  email: null,
  username: name.split(" ")[0]?.toLowerCase() ?? null,
  role,
  twoFactorEnabled: false,
  mustChangePassword: false,
  joinedAt: "2026-01-02T05:00:00.000Z",
});

const staff = [
  person(owner.member.memberId, "Asha Sharma", { key: "org-owner", name: "Owner", isOwner: true }),
  person("0199a000-0000-7000-8000-00000000000a", "Ravi Kumar", { key: "sales", name: "Sales", isOwner: false }),
];
const roles: RoleSummary[] = [
  { key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 },
  { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 1 },
];

const statusOf: Record<LifecycleAccess, SubscriptionStatus> = {
  full: "active",
  read_only: "read_only",
  export_only: "suspended",
  locked: "cancelled",
};

function renderStaff(access: LifecycleAccess, answers: Record<string, Answer> = {}) {
  stubApi({
    "subscription.get": {
      data: {
        status: statusOf[access],
        access,
        planName: "Growth",
        modules: [],
        trialEndsOn: null,
        paidThrough: null,
        nextChangeOn: null,
        limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
      },
    },
    "staff.list": { data: staff },
    "roles.list": { data: roles },
    ...answers,
  });
  const queryClient = newQueryClient(null);
  renderWithApi(<StaffScreen />, queryClient, owner);
  return queryClient;
}

async function openActionsForRavi() {
  await userEvent.click(await screen.findByRole("button", { name: "Actions for Ravi Kumar" }));
  return screen.findByRole("menu");
}

beforeEach(() => {
  screenIs("wide");
  toast.error.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the staff screen in each state of the subscription", () => {
  it("offers every change while the subscription is paid", async () => {
    const queryClient = renderStaff("full");
    const add = await screen.findByRole("button", { name: "Add staff" });
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(add).toBeEnabled();
    const menu = await openActionsForRavi();
    expect(within(menu).getByRole("menuitem", { name: "Change role" })).not.toHaveAttribute("aria-disabled");
  });

  it("read-only, shows adding staff and changing a role disabled with the reason, and leaves revoking open", async () => {
    renderStaff("read_only");
    const add = await screen.findByRole("button", { name: "Add staff" });
    await waitFor(() => {
      expect(add).toBeDisabled();
    });
    expect(add).toHaveAccessibleDescription(reasons.ORGANIZATION_READ_ONLY);
    // The read-only banner says it above every screen: under the button it is for screen readers only.
    expect(document.getElementById("add-staff-refused")).toHaveClass("sr-only");
    const menu = await openActionsForRavi();
    expect(within(menu).getByText(reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Change role" })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByRole("menuitem", { name: "Reset password" })).not.toHaveAttribute("aria-disabled");
    expect(within(menu).getByRole("menuitem", { name: "Remove" })).not.toHaveAttribute("aria-disabled");
  });

  it("suspended, shows the Owner the list to remove someone, though the roles list is refused", async () => {
    renderStaff("export_only", { "roles.list": { status: 403, reason: "ORGANIZATION_SUSPENDED" } });
    expect(await screen.findByText("Ravi Kumar")).toBeVisible();
    const add = screen.getByRole("button", { name: "Add staff" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(reasons.ORGANIZATION_SUSPENDED);
    const menu = await openActionsForRavi();
    expect(within(menu).getByRole("menuitem", { name: "Change role" })).toHaveAttribute("aria-disabled", "true");
    expect(within(menu).getByRole("menuitem", { name: "Remove" })).not.toHaveAttribute("aria-disabled");
  });

  it("doesn't invite adding staff while adding is refused, when nobody else is here", async () => {
    renderStaff("read_only", { "staff.list": { data: staff.slice(0, 1) } });
    expect(await screen.findByText(messages.staff.emptyNoAdding)).toBeVisible();
    expect(screen.queryByText(messages.staff.empty)).toBeNull();
  });

  it("keeps the reason visible where no banner says it: the suspended Owner's Staff", async () => {
    renderStaff("export_only", { "roles.list": { status: 403, reason: "ORGANIZATION_SUSPENDED" } });
    const add = await screen.findByRole("button", { name: "Add staff" });
    await waitFor(() => {
      expect(add).toHaveAccessibleDescription(reasons.ORGANIZATION_SUSPENDED);
    });
    expect(document.getElementById("add-staff-refused")).not.toHaveClass("sr-only");
  });

  it("says why when the api refuses what the screen still offered", async () => {
    renderStaff("full", { "staff.remove": { status: 403, reason: "ORGANIZATION_CANCELLED" } });
    const menu = await openActionsForRavi();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove Ravi Kumar?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    // In the dialog, which stays open, rather than a toast as well.
    expect(await within(confirm).findByText(reasons.ORGANIZATION_CANCELLED)).toBeVisible();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
