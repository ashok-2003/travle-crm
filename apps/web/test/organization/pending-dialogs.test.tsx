// A dialog that sends a request stays open until the api answers (the fix wave's rule 7): Cancel is disabled, the
// close button is gone and Escape does nothing while the call is out, so its answer always lands where the person can
// see it: the handover of a new temporary password, the new role's editor, the refusal's reason.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateRoleDialog } from "@/organization/roles/create-role-dialog";
import { DeleteRoleDialog } from "@/organization/roles/delete-role-dialog";
import { CreateStaffDialog } from "@/organization/staff/create-staff-dialog";
import { RemoveStaffDialog } from "@/organization/staff/remove-staff-dialog";
import { ResetPasswordDialog } from "@/organization/staff/reset-password-dialog";
import { fakeApi, newQueryClient, renderWithApi } from "./api";
import { screenIs } from "./render";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const roles: RoleSummary[] = [
  { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 1 },
  { key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 },
];
const unused: RoleSummary = {
  key: "senior-sales",
  name: "Senior sales",
  isOwner: false,
  permissions: [],
  memberCount: 0,
};

const ravi: StaffMember = {
  memberId: "0199a000-0000-7000-8000-00000000000a",
  userId: "0199a000-0000-7000-8000-00000000000b",
  name: "Ravi",
  email: null,
  username: "ravi",
  role: { key: "sales", name: "Sales" },
  twoFactorEnabled: false,
  mustChangePassword: true,
  joinedAt: "2026-10-15T18:45:00.000Z",
};

/** Waits for the dialog's call, then checks that nothing closes the dialog while it is out. */
async function stillOpenWhilePending(api: ReturnType<typeof fakeApi>, cancel: string | null) {
  await waitFor(() => {
    expect(api.calls).toHaveLength(1);
  });
  if (cancel !== null) expect(screen.getByRole("button", { name: cancel })).toBeDisabled();
  else expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole(cancel === null ? "dialog" : "alertdialog")).toBeVisible();
}

describe("a dialog with its request out", () => {
  beforeEach(() => {
    screenIs("wide");
    push.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Add staff stays open, then hands the new temporary password over", async () => {
    const api = fakeApi();
    renderWithApi(<CreateStaffDialog roles={roles} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
    await userEvent.type(await screen.findByLabelText("Full name"), "Ravi");
    await userEvent.type(screen.getByLabelText(/^Username/), "ravi");
    const password = screen.getByLabelText<HTMLInputElement>("Temporary password").value;
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await stillOpenWhilePending(api, null);
    api.last().answer(ravi);
    expect(await screen.findByText(password)).toBeVisible();
  });

  it("Reset password stays open, then hands the new temporary password over", async () => {
    const api = fakeApi();
    const onOpenChange = vi.fn();
    renderWithApi(
      <ResetPasswordDialog member={ravi} open onOpenChange={onOpenChange} returnFocusTo={{ current: null }} />,
      newQueryClient(),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Reset password" }));
    await stillOpenWhilePending(api, null);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    api.last().answer({});
    expect(await screen.findByRole("button", { name: "Done" })).toBeVisible();
  });

  it("Reset password stays open on a phone too, as a bottom sheet with no close button", async () => {
    screenIs("phone");
    const api = fakeApi();
    const onOpenChange = vi.fn();
    renderWithApi(
      <ResetPasswordDialog member={ravi} open onOpenChange={onOpenChange} returnFocusTo={{ current: null }} />,
      newQueryClient(),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Reset password" }));
    await stillOpenWhilePending(api, null);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    api.last().answer({});
    expect(await screen.findByRole("button", { name: "Done" })).toBeVisible();
    // Answered, the sheet closes again.
    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
  });

  it("New role stays open, then opens the new role's editor", async () => {
    const api = fakeApi();
    renderWithApi(<CreateRoleDialog />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "New role" }));
    await userEvent.type(screen.getByLabelText("Name"), "Senior sales");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await stillOpenWhilePending(api, null);
    expect(screen.getByLabelText("Name")).toHaveValue("Senior sales");
    api.last().answer(unused);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/roles/senior-sales");
    });
  });

  it("Remove stays open, with Cancel disabled, until the api answers", async () => {
    const api = fakeApi();
    const onOpenChange = vi.fn();
    renderWithApi(
      <RemoveStaffDialog member={ravi} open onOpenChange={onOpenChange} returnFocusTo={{ current: null }} />,
      newQueryClient(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await stillOpenWhilePending(api, "Cancel");
    expect(onOpenChange).not.toHaveBeenCalled();
    api.last().answer({});
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("Delete role stays open, with Cancel disabled, until the api answers", async () => {
    const api = fakeApi();
    renderWithApi(<DeleteRoleDialog role={unused} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Delete role" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await stillOpenWhilePending(api, "Cancel");
    api.last().answer({});
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/roles");
    });
  });
});
