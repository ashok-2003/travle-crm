// Add staff takes an optional phone typed the Indian way, and sends it as the api's schema reads it (B51); the list
// shows it, and the row's menu changes it.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateStaffDialog } from "@/organization/staff/create-staff-dialog";
import { StaffList } from "@/organization/staff/staff-list";
import { fakeApi, newQueryClient, renderWithApi } from "../api";
import { renderAs, screenIs } from "../render";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const roles: RoleSummary[] = [{ key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 1 }];

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

describe("staff phones on the Staff screen", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds staff with an optional phone, shows it on the list, and changes it from the row's menu", async () => {
    const api = fakeApi();
    renderWithApi(<CreateStaffDialog roles={roles} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
    await userEvent.type(await screen.findByLabelText("Full name"), "Ravi");
    await userEvent.type(screen.getByLabelText(/^Username/), "ravi");
    await userEvent.type(screen.getByLabelText(/^Phone/), "98765 01234");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(api.last().path).toBe("staff.create");
    expect(api.last().input).toMatchObject({ name: "Ravi", username: "ravi", phone: "+919876501234" });
  });

  it("leaves the phone out when it is blank, and says so on a number it can't read", async () => {
    const api = fakeApi();
    renderWithApi(<CreateStaffDialog roles={roles} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
    await userEvent.type(await screen.findByLabelText("Full name"), "Meera");
    await userEvent.type(screen.getByLabelText(/^Username/), "meera");
    await userEvent.type(screen.getByLabelText(/^Phone/), "12");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Use a phone number like 98765 43210.")).toBeVisible();
    expect(api.calls).toHaveLength(0);
    await userEvent.clear(screen.getByLabelText(/^Phone/));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(api.last().input).not.toHaveProperty("phone");
  });

  it("shows a person's phone on the list, and changes it from the row's menu", async () => {
    const api = fakeApi();
    renderAs(<StaffList staff={[ravi]} roles={roles} />);
    const row = screen.getByRole("row", { name: /Ravi/ });
    expect(within(row).getByText("+91 98765 01234")).toBeVisible();
    await userEvent.click(within(row).getByRole("button", { name: "Actions for Ravi" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Change phone" }));
    const box = await screen.findByLabelText("Phone");
    expect(box).toHaveValue("98765 01234");
    await userEvent.clear(box);
    await userEvent.type(box, "98111 22233");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(api.last().path).toBe("staff.changePhone");
    expect(api.last().input).toEqual({ memberId: ravi.memberId, phone: "+919811122233" });
  });
});
