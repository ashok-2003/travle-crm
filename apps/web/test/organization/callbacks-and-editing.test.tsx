// Things the organization screens promise that do not depend on timing or on a screen staying mounted: a refused
// clipboard says so, a closed "New role" dialog starts over, a deleted role's toast and redirect happen even though
// its editor goes away, and a role edited in two places keeps the person's unsaved edits and says so.
import type { PermissionCatalogEntry, RoleSummary } from "@travel-crm/contracts/identity";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/organization/copy-button";
import { CreateRoleDialog } from "@/organization/roles/create-role-dialog";
import { DeleteRoleDialog } from "@/organization/roles/delete-role-dialog";
import { RoleEditor } from "@/organization/roles/role-editor";
import { fakeApi, newQueryClient, renderWithApi } from "./api";
import { screenIs } from "./render";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const catalog: PermissionCatalogEntry[] = [
  { permission: "leads:create", module: "leads", scoped: false },
  { permission: "staff:manage", module: "staff", scoped: false },
];
const role = (name: string, permissions: string[], memberCount = 0): RoleSummary => ({
  key: "senior-sales",
  name,
  isOwner: false,
  permissions: permissions.map((permission) => ({ permission, scope: null })),
  memberCount,
});

describe("organization screens", () => {
  beforeEach(() => {
    screenIs("wide");
    toast.success.mockClear();
    toast.error.mockClear();
    push.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says so when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) } });
    renderWithApi(<CopyButton value="SHARMA" label="Copy the code" />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Copy the code" }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("starts the New role dialog over after it is closed", async () => {
    renderWithApi(<CreateRoleDialog />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "New role" }));
    await userEvent.type(screen.getByLabelText("Name"), "Half typed");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByLabelText("Name")).toBeNull();
    });
    await userEvent.click(screen.getByRole("button", { name: "New role" }));
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("opens the new role's editor when it is created, and toasts and leaves when a role is deleted", async () => {
    const api = fakeApi();
    const { unmount } = renderWithApi(<CreateRoleDialog />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "New role" }));
    await userEvent.type(screen.getByLabelText("Name"), "Senior sales");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    api.last().answer(role("Senior sales", []));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/roles/senior-sales");
    });
    unmount();

    renderWithApi(<DeleteRoleDialog role={role("Senior sales", [])} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Delete role" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    api.last().answer({});
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Senior sales was deleted");
    });
    expect(push).toHaveBeenCalledWith("/roles");
  });

  it("keeps unsaved edits when the saved role changes, and says so; untouched, it follows the saved role", async () => {
    const queryClient = newQueryClient();
    const { rerender } = renderWithApi(
      <RoleEditor role={role("Senior sales", ["leads:create"])} catalog={catalog} />,
      queryClient,
    );
    // Untouched: someone else's rename shows at once, with no warning.
    rerender(<RoleEditor role={role("Seniors", ["leads:create"])} catalog={catalog} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveValue("Seniors");
    });
    expect(screen.queryByText(/saved by someone else/)).toBeNull();

    // Edited: a later change from elsewhere does not replace the edit, and the editor warns.
    await userEvent.type(screen.getByLabelText("Name"), " team");
    rerender(<RoleEditor role={role("Seniors", ["leads:create", "staff:manage"])} catalog={catalog} />);
    expect(await screen.findByText(/saved by someone else/)).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Seniors team");

    await userEvent.click(screen.getByRole("button", { name: /load the saved role/i }));
    expect(screen.getByLabelText("Name")).toHaveValue("Seniors");
    expect(screen.queryByText(/saved by someone else/)).toBeNull();
  });
});
