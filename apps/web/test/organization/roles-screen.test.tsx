// The roles list shows each role's name in full as a badge in the role's own colour (DESIGN.md "Role Badges"), the same
// as on Staff, with room for Indian scripts: role names are typed by people, in any script, and carry no lang to say
// which (DESIGN.md section 3).
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { roleTint } from "@/organization/roles/role-badge";
import { RolesScreen } from "@/organization/roles/roles-screen";
import { fakeApi, newQueryClient, renderWithApi } from "./api";
import { screenIs } from "./render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RolesScreen", () => {
  it("gives role names room for Indian scripts", async () => {
    screenIs("wide");
    const api = fakeApi();
    renderWithApi(<RolesScreen />, newQueryClient());
    await vi.waitFor(() => {
      expect(api.last().path).toBe("roles.list");
    });
    api.last().answer([{ key: "sales", name: "बिक्री", isOwner: false, permissions: [], memberCount: 3 }]);
    expect(await screen.findByText("बिक्री")).toHaveClass("script-leading");
  });

  it("shows each role as a badge in its colour, the Owner's orchid", async () => {
    screenIs("wide");
    const api = fakeApi();
    renderWithApi(<RolesScreen />, newQueryClient());
    await vi.waitFor(() => {
      expect(api.last().path).toBe("roles.list");
    });
    api.last().answer([
      { key: "org-owner", name: "Owner", isOwner: true, permissions: [], memberCount: 1 },
      { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 3 },
    ]);
    expect(await screen.findByText("Owner")).toHaveClass(...roleTint({ key: "org-owner", isOwner: true }).split(" "));
    expect(screen.getByText("Sales")).toHaveClass(...roleTint({ key: "sales", isOwner: false }).split(" "));
  });
});
