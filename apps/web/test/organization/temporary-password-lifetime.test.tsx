// The temporary password an admin hands over is a secret that must live only while its dialog shows it: it is not
// kept in the mutation cache after the dialog closes, and when the device is offline the call fails at once instead
// of waiting (a waiting call is what the query cache would save to IndexedDB, variables and all).
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { dehydrate, onlineManager } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateStaffDialog } from "@/organization/staff/create-staff-dialog";
import { ResetPasswordDialog } from "@/organization/staff/reset-password-dialog";
import { fakeApi, newQueryClient, renderWithApi } from "./api";
import { screenIs } from "./render";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const roles: RoleSummary[] = [
  { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 1 },
  { key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 },
];

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

async function addRavi() {
  await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
  await userEvent.type(await screen.findByLabelText("Full name"), "Ravi");
  await userEvent.type(screen.getByLabelText(/^Username/), "ravi");
  const password = screen.getByLabelText<HTMLInputElement>("Temporary password").value;
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  return password;
}

describe("the temporary password's lifetime", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
  });

  it("is gone from the screen and the mutation cache once the add dialog closes", async () => {
    const api = fakeApi();
    const queryClient = newQueryClient();
    renderWithApi(<CreateStaffDialog roles={roles} />, queryClient);
    const password = await addRavi();
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    api.last().answer({ ...ravi });
    expect(await screen.findByText(password)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByText(password)).toBeNull();
    });
    await waitFor(() => {
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    });
  });

  it("fails at once when offline, leaving nothing for the cache to save", async () => {
    const api = fakeApi();
    const queryClient = newQueryClient();
    renderWithApi(<CreateStaffDialog roles={roles} />, queryClient);
    onlineManager.setOnline(false);
    await addRavi();
    // Not paused: the call is made, and fails the way an unreachable server does.
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    api.last().fail();
    expect(await screen.findByRole("alert")).toHaveTextContent(/connection|offline|reach/i);
    expect(dehydrate(queryClient).mutations).toEqual([]);
  });

  it("is gone from the mutation cache once the reset dialog closes", async () => {
    const api = fakeApi();
    const queryClient = newQueryClient();
    const onOpenChange = vi.fn();
    renderWithApi(
      <ResetPasswordDialog member={ravi} open onOpenChange={onOpenChange} returnFocusTo={{ current: null }} />,
      queryClient,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Reset password" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    api.last().answer({});
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => {
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    });
  });
});
