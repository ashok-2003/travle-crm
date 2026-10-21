// The Change phone dialog sends the number as typed, or null once emptied; the dialog stays open while the call is
// out (rule 7), and a refusal shows in it.
import type { StaffMember } from "@travel-crm/contracts/identity";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePhoneDialog } from "@/organization/staff/change-phone-dialog";
import { fakeApi, newQueryClient, renderWithApi } from "../api";
import { screenIs } from "../render";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ravi: StaffMember = {
  memberId: "0199a000-0000-7000-8000-00000000000a",
  userId: "0199a000-0000-7000-8000-00000000000b",
  name: "Ravi",
  email: null,
  username: "ravi",
  phone: "+919876501234",
  role: { key: "sales", name: "Sales", isOwner: false },
  twoFactorEnabled: false,
  mustChangePassword: false,
  joinedAt: "2026-10-15T18:45:00.000Z",
};

describe("ChangePhoneDialog", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends null once the box is emptied, and stays open while the call is out", async () => {
    const api = fakeApi();
    const onOpenChange = vi.fn();
    renderWithApi(
      <ChangePhoneDialog member={ravi} open onOpenChange={onOpenChange} returnFocusTo={{ current: null }} />,
      newQueryClient(),
    );
    await userEvent.clear(await screen.findByLabelText("Phone"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    expect(api.last().input).toEqual({ memberId: ravi.memberId, phone: null });
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("shows the api's refusal", async () => {
    const api = fakeApi();
    renderWithApi(
      <ChangePhoneDialog member={ravi} open onOpenChange={vi.fn()} returnFocusTo={{ current: null }} />,
      newQueryClient(),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    api.last().refuse(403, "CANNOT_CHANGE_YOURSELF");
    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
