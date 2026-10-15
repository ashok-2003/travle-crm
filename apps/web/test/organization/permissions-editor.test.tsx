// The permissions editor names every permission in plain words, grouped by module, asks whose records a view
// permission covers once it is ticked, and shows the Owner role as holding everything, unchangeable.
import type { PermissionCatalogEntry } from "@travel-crm/contracts/identity";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Grant } from "@/organization/roles/permission-grants";
import { PermissionsEditor } from "@/organization/roles/permissions-editor";
import { renderAs } from "./render";

const catalog: PermissionCatalogEntry[] = [
  { permission: "leads:view", module: "leads", scoped: true },
  { permission: "leads:create", module: "leads", scoped: false },
  { permission: "staff:manage", module: "staff", scoped: false },
  { permission: "leads:export", module: "leads", scoped: false },
];

describe("PermissionsEditor", () => {
  it("groups permissions under their module, in plain words, with the key for one that has none yet", () => {
    renderAs(<PermissionsEditor catalog={catalog} grants={[]} onChange={vi.fn()} readOnly={false} />);
    const leads = screen.getByRole("group", { name: "Leads" });
    expect(within(leads).getByRole("checkbox", { name: "See leads" })).not.toBeChecked();
    expect(within(leads).getByRole("checkbox", { name: "leads:export" })).toBeVisible();
    expect(screen.getByRole("group", { name: "Staff" })).toBeVisible();
  });

  it("ticks a view permission for the person's own records first", async () => {
    const onChange = vi.fn<(grants: Grant[]) => void>();
    renderAs(<PermissionsEditor catalog={catalog} grants={[]} onChange={onChange} readOnly={false} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "See leads" }));
    expect(onChange).toHaveBeenCalledWith([{ permission: "leads:view", scope: "own" }]);
  });

  it("asks whose records a ticked view permission covers", () => {
    renderAs(
      <PermissionsEditor
        catalog={catalog}
        grants={[{ permission: "leads:view", scope: "all" }]}
        onChange={vi.fn()}
        readOnly={false}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Whose records: See leads" })).toHaveTextContent("Everyone's");
  });

  it("shows the Owner role holding everything, unchangeable", () => {
    renderAs(<PermissionsEditor catalog={catalog} grants={[]} onChange={vi.fn()} readOnly />);
    for (const checkbox of screen.getAllByRole("checkbox")) {
      expect(checkbox).toBeChecked();
      expect(checkbox).toBeDisabled();
    }
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
