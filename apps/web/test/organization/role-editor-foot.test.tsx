// The role editor's foot (DESIGN.md: one primary per region, the mobile sticky action bar): Delete and Save share one
// row, which stays above the phone's bottom bar while the permissions scroll, and the reasons a button is disabled
// come under that row, each tied to its button.
import type { PermissionCatalogEntry, RoleSummary } from "@travel-crm/contracts/identity";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { RoleEditor } from "@/organization/roles/role-editor";
import { newQueryClient, renderWithApi } from "./api";
import { screenIs } from "./render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const catalog: PermissionCatalogEntry[] = [{ permission: "staff:manage", module: "staff", scoped: false }];
const inUse: RoleSummary = { key: "sales", name: "Sales", isOwner: false, permissions: [], memberCount: 2 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the role editor's foot", () => {
  it("puts Delete and Save on one row that sticks above the phone's bar, and the reason under it", () => {
    screenIs("phone");
    renderWithApi(<RoleEditor role={inUse} catalog={catalog} />, newQueryClient());
    const remove = screen.getByRole("button", { name: messages.roles.delete.action });
    const save = screen.getByRole("button", { name: messages.roles.editor.save });
    expect(remove.parentElement).toBe(save.parentElement);
    expect(remove.parentElement?.parentElement).toHaveClass("sticky", "md:static");
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription("2 people have this role. Give them another role before deleting it.");
    const hint = document.getElementById("role-in-use");
    expect(save.compareDocumentPosition(hint ?? document.body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
