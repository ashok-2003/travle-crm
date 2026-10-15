// The roles list shows each role's name in full, with room for Indian scripts: role names are typed by people, in any
// script, and carry no lang to say which (DESIGN.md section 3).
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
