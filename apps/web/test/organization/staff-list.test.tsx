// The staff list shows each person by name, how they sign in, their role as a badge in the role's own colour
// (DESIGN.md "Role Badges") and when they joined (in the organization's zone), flags a temporary password still to
// change, and offers no actions on the viewer's own row.
import type { RoleSummary, StaffMember } from "@travel-crm/contracts/identity";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { roleTint } from "@/organization/roles/role-badge";
import { StaffList } from "@/organization/staff/staff-list";
import { member } from "../support/members";
import { renderAs, screenIs } from "./render";

const owner = member({ isOwner: true });

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
  {
    memberId: "0199a000-0000-7000-8000-00000000000a",
    userId: "0199a000-0000-7000-8000-00000000000b",
    name: "रवि कुमार",
    email: null,
    username: "ravi",
    role: { key: "sales", name: "Sales" },
    twoFactorEnabled: false,
    mustChangePassword: true,
    // 18:45 UTC on 15 October is already 16 October in India.
    joinedAt: "2026-10-15T18:45:00.000Z",
  },
];

const tintOf = (key: string, isOwner = false) => roleTint({ key, isOwner }).split(" ");

const roles: RoleSummary[] = [
  { key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 },
  { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 1 },
];

describe("StaffList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a table on wide screens, with dates in the organization's zone", () => {
    screenIs("wide");
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    const ravi = screen.getByRole("row", { name: /रवि कुमार/ });
    expect(within(ravi).getByText("ravi")).toBeVisible();
    expect(within(ravi).getByText("Sales")).toBeVisible();
    expect(within(ravi).getByText("Must change password")).toBeVisible();
    expect(within(ravi).getByText(/^16 Oct/)).toBeVisible();
    expect(within(ravi).getByRole("button", { name: "Actions for रवि कुमार" })).toBeVisible();
  });

  it("shows each role as a badge in its colour, the Owner's plum", () => {
    screenIs("wide");
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    const asha = screen.getByRole("row", { name: /Asha/ });
    expect(within(asha).getByText("Owner")).toHaveClass(...tintOf("org-owner", true));
    const ravi = screen.getByRole("row", { name: /रवि कुमार/ });
    expect(within(ravi).getByText("Sales")).toHaveClass(...tintOf("sales"));
  });

  it("keeps the Owner's plum where the subscription refuses the roles list, from the viewer's own role", () => {
    screenIs("wide");
    renderAs(<StaffList staff={staff} roles={[]} />, owner);
    expect(screen.getByText("Owner")).toHaveClass(...tintOf("org-owner", true));
    expect(screen.getByText("Sales")).toHaveClass(...tintOf("sales"));
  });

  it("offers no actions on the viewer's own row", () => {
    screenIs("wide");
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    const asha = screen.getByRole("row", { name: /Asha/ });
    expect(within(asha).getByText("You")).toBeVisible();
    expect(within(asha).queryByRole("button")).toBeNull();
  });

  it("is a divided list on phones", () => {
    screenIs("phone");
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Sales")).toHaveClass(...tintOf("sales"));
    expect(screen.getByText(/^ravi · Joined 16 Oct/)).toBeVisible();
  });

  it("gives names room for Indian scripts, in the table and on phones", () => {
    // Devanagari matras need a taller line than Latin text (DESIGN.md section 3); a name carries no lang to say so.
    screenIs("wide");
    const { unmount } = renderAs(<StaffList staff={staff} roles={roles} />, owner);
    const ravi = screen.getByRole("row", { name: /रवि कुमार/ });
    expect(within(ravi).getByText("रवि कुमार")).toHaveClass("script-leading");
    expect(within(ravi).getByText("Sales")).toHaveClass("script-leading");
    unmount();
    screenIs("phone");
    renderAs(<StaffList staff={staff} roles={roles} />, owner);
    expect(screen.getByText("रवि कुमार")).toHaveClass("script-leading");
    expect(screen.getByText("Sales")).toHaveClass("script-leading");
  });

  it("never shows a placeholder address", () => {
    screenIs("wide");
    const leaked = staff.map((person) =>
      person.username === "ravi" ? { ...person, email: "s-ravi@no-email.invalid" } : person,
    );
    const { container } = renderAs(<StaffList staff={leaked} roles={roles} />, owner);
    expect(container.textContent).not.toMatch(/\.invalid/i);
  });

  it("never shows a placeholder address in the phone list either", () => {
    screenIs("phone");
    const leaked = staff.map((person) =>
      person.username === "ravi" ? { ...person, email: "s-ravi@no-email.invalid" } : person,
    );
    const { container } = renderAs(<StaffList staff={leaked} roles={roles} />, owner);
    expect(container.textContent).not.toMatch(/\.invalid/i);
    expect(screen.getByText(/^ravi · Joined/)).toBeVisible();
  });
});
