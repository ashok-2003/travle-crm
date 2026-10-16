// The roles screens as the subscription allows (ADR 0021): every change to a role is one, so in a read-only
// organization adding a role, editing one, saving and deleting are shown disabled with the reason; paid, they open.
import type { PermissionCatalogEntry, RoleSummary } from "@travel-crm/contracts/identity";
import type { LifecycleAccess } from "@travel-crm/contracts/subscriptions";
import type { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { RoleEditorScreen } from "@/organization/roles/role-editor-screen";
import { RolesScreen } from "@/organization/roles/roles-screen";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { reasons } = messages.errors;

const roles: RoleSummary[] = [
  { key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 },
  {
    key: "sales",
    name: "Sales",
    isOwner: false,
    permissions: [{ permission: "leads:view", scope: "own" }],
    memberCount: 0,
  },
];
const catalog: PermissionCatalogEntry[] = [
  { permission: "leads:view", module: "leads", scoped: true },
  { permission: "staff:manage", module: "staff", scoped: false },
];

function answerFor(access: LifecycleAccess) {
  stubApi({
    "subscription.get": {
      data: {
        status: access === "full" ? "active" : "read_only",
        access,
        planName: "Growth",
        modules: [],
        trialEndsOn: null,
        paidThrough: null,
        nextChangeOn: null,
        limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
      },
    },
    "roles.list": { data: roles },
    "roles.permissionCatalog": { data: catalog },
  });
}

/** Waits until the screen's calls, the subscription's among them, have been answered. */
async function settled(queryClient: QueryClient) {
  await waitFor(() => {
    expect(queryClient.isFetching()).toBe(0);
  });
}

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the roles screens in each state of the subscription", () => {
  it("offer a new role, and every edit, while the subscription is paid", async () => {
    answerFor("full");
    const list = newQueryClient(null);
    renderWithApi(<RolesScreen />, list);
    expect(await screen.findByText("Sales")).toBeVisible();
    await settled(list);
    expect(screen.getByRole("button", { name: "New role" })).toBeEnabled();
    answerFor("full");
    const editor = newQueryClient(null);
    renderWithApi(<RoleEditorScreen roleKey="sales" />, editor);
    expect(await screen.findByRole("button", { name: "Save" })).toBeVisible();
    await settled(editor);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeEnabled();
  });

  it("read-only, show a new role disabled with the reason", async () => {
    answerFor("read_only");
    renderWithApi(<RolesScreen />, newQueryClient(null));
    const add = screen.getByRole("button", { name: "New role" });
    await waitFor(() => {
      expect(add).toBeDisabled();
    });
    expect(add).toHaveAccessibleDescription(reasons.ORGANIZATION_READ_ONLY);
  });

  it("read-only, show the role's name, permissions, saving and deleting disabled, with the reason", async () => {
    answerFor("read_only");
    renderWithApi(<RoleEditorScreen roleKey="sales" />, newQueryClient(null));
    const save = await screen.findByRole("button", { name: "Save" });
    await waitFor(() => {
      expect(save).toBeDisabled();
    });
    // Each disabled control says why, not only Save: a screen reader otherwise hears only "dimmed".
    const disabled = [
      save,
      screen.getByRole("button", { name: "Delete role" }),
      screen.getByRole("textbox", { name: "Name" }),
      ...screen.getAllByRole("checkbox"),
      screen.getByRole("combobox"),
    ];
    for (const control of disabled) {
      expect(control).toBeDisabled();
      expect(control).toHaveAccessibleDescription(reasons.ORGANIZATION_READ_ONLY);
    }
  });
});
