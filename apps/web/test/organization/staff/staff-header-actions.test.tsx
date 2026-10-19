// The Staff header (spec 3.1): Add staff stays the one primary button, with Import and Export outline beside it; while
// the agency can't make changes Import is off with its reason and Export still works, and it is off only when even
// exports are refused (ADR 0021).
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import type { LifecycleAccess, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { StaffScreen } from "@/organization/staff/staff-screen";
import { newQueryClient, renderWithApi } from "../api";
import { screenIs } from "../render";
import { stubApi } from "../../support/api-stub";
import { member } from "../../support/members";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const owner = member({ isOwner: true });
const { reasons } = messages.errors;

const person = (memberId: string, name: string): StaffMember => ({
  memberId,
  userId: `${memberId}-user`,
  name,
  email: null,
  username: name.toLowerCase(),
  phone: null,
  role: { key: "sales", name: "Sales", isOwner: false },
  twoFactorEnabled: false,
  mustChangePassword: false,
  joinedAt: "2026-01-02T05:00:00.000Z",
});
const staff = [person(owner.member.memberId, "Asha"), person("0199a000-0000-7000-8000-00000000000a", "Ravi")];
const roles: RoleSummary[] = [{ key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 2 }];

const statusOf: Record<LifecycleAccess, SubscriptionStatus> = {
  full: "active",
  read_only: "read_only",
  export_only: "suspended",
  locked: "cancelled",
};

function renderStaff(access: LifecycleAccess) {
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
  });
  renderWithApi(<StaffScreen />, newQueryClient(null), owner);
}

describe("the Staff header", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps Add staff primary, with Import and Export outline beside it", async () => {
    renderStaff("full");
    const add = await screen.findByRole("button", { name: "Add staff" });
    await waitFor(() => {
      expect(add).toBeEnabled();
    });
    expect(add).toHaveAttribute("data-variant", "default");
    const importLink = screen.getByRole("link", { name: "Import" });
    expect(importLink).toHaveAttribute("href", "/staff/import");
    expect(importLink).toHaveAttribute("data-variant", "outline");
    const exportButton = screen.getByRole("button", { name: "Export" });
    expect(exportButton).toHaveAttribute("data-variant", "outline");
    expect(exportButton).toBeEnabled();
  });

  it("turns Import off with its hint while the agency can't make changes, and leaves Export working", async () => {
    renderStaff("read_only");
    const importButton = await screen.findByRole("button", { name: "Import" });
    await waitFor(() => {
      expect(importButton).toBeDisabled();
    });
    expect(importButton).toHaveAccessibleDescription(reasons.ORGANIZATION_READ_ONLY);
    expect(screen.queryByRole("link", { name: "Import" })).toBeNull();
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("turns Export off too once the agency is locked", async () => {
    renderStaff("locked");
    const exportButton = await screen.findByRole("button", { name: "Export" });
    await waitFor(() => {
      expect(exportButton).toBeDisabled();
    });
  });
});
