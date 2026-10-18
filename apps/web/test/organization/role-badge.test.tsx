// A staff role as a badge (DESIGN.md "Role Badges"): the Owner role always plum, every other role one of seven tints
// picked by its key, so a role is the same colour on every screen and every load, and the starter roles all differ.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoleBadge, roleTint, roleTints } from "@/organization/roles/role-badge";
import { renderPiece } from "../leads/render";

const ownerTint = "bg-role-owner-fill text-role-owner-ink";

describe("roleTint", () => {
  it("gives the Owner role plum, whatever its key", () => {
    expect(roleTint({ key: "org-owner", isOwner: true })).toBe(ownerTint);
    expect(roleTint({ key: "sales", isOwner: true })).toBe(ownerTint);
  });

  it("gives a role the same tint every time, from its key alone", () => {
    const first = roleTint({ key: "visa-desk-3f9a2c", isOwner: false });
    expect(roleTint({ key: "visa-desk-3f9a2c", isOwner: false })).toBe(first);
    expect(roleTints).toContain(first);
  });

  it("gives the four starter roles four different tints, none of them the Owner's", () => {
    const starters = ["org-admin", "sales", "operations", "accounts"].map((key) => roleTint({ key, isOwner: false }));
    expect(new Set(starters).size).toBe(4);
    expect(starters).not.toContain(ownerTint);
  });

  it("spreads the roles an agency adds over the tints", () => {
    const keys = Array.from({ length: 40 }, (_, index) => `role-${index.toString(16).padStart(6, "0")}`);
    expect(new Set(keys.map((key) => roleTint({ key, isOwner: false }))).size).toBe(roleTints.length);
  });
});

describe("RoleBadge", () => {
  it("shows the role's name on its tint, with room for Indian scripts and no status dot", () => {
    renderPiece(<RoleBadge role={{ key: "sales", name: "बिक्री" }} isOwner={false} />);
    const badge = screen.getByText("बिक्री");
    expect(badge).toHaveClass(
      "script-leading",
      "rounded-badge",
      ...roleTint({ key: "sales", isOwner: false }).split(" "),
    );
    expect(badge.querySelector("[aria-hidden=true]")).toBeNull();
  });
});
