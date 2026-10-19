// The staff import's second step (spec 3.4, B43): the columns, what is still needed, the role for everyone when the file
// has no Role column, and a Role column's values matched to the agency's roles one by one.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffMatchStep } from "@/organization/staff/import/staff-match-step";
import { fakeApi, newQueryClient, renderWithApi } from "../../api";
import { screenIs } from "../../render";
import { aPage, allowSelects, importId, seedRoles } from "./support";

const name = { position: 0, header: "Full Name", samples: ["Kavita Rao"], values: null, field: "name" as const };
const login = { position: 1, header: "Login", samples: ["kavita"], values: null, field: "username" as const };
const designation = {
  position: 2,
  header: "Designation",
  samples: ["Telecaller", "Sales"],
  values: [
    { value: "Telecaller", rows: 5 },
    { value: "Sales", rows: 3 },
  ],
  field: "role" as const,
};

function setup(page = aPage({ status: "matching" })) {
  const api = fakeApi();
  const queryClient = newQueryClient();
  seedRoles(queryClient);
  const onMatched = vi.fn();
  renderWithApi(<StaffMatchStep page={page} onMatched={onMatched} />, queryClient);
  return { api, onMatched };
}

describe("StaffMatchStep", () => {
  beforeEach(() => {
    screenIs("wide");
    allowSelects();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks 'Give everyone the role' without a Role column, and sends the match once a role is chosen", async () => {
    const { api } = setup(
      aPage({
        status: "matching",
        columns: [
          { ...name, guessedBy: "common-name" },
          { ...login, guessedBy: null },
        ],
      }),
    );
    expect(screen.getByText("Give everyone the role")).toBeVisible();
    const check = screen.getByRole("button", { name: "Check the rows" });
    expect(check).toBeDisabled();
    expect(within(screen.getByRole("list")).getByText("A role for everyone")).toBeVisible();
    await userEvent.click(screen.getByRole("combobox", { name: "Give everyone the role" }));
    // The Owner role isn't offered: it is added one at a time, from Add staff.
    expect(screen.queryByRole("option", { name: "Owner" })).toBeNull();
    await userEvent.click(await screen.findByRole("option", { name: "Operations" }));
    expect(check).toBeEnabled();
    await userEvent.click(check);
    expect(api.last().path).toBe("staffImports.match");
    expect(api.last().input).toEqual({
      importId,
      columns: [
        { position: 0, field: "name" },
        { position: 1, field: "username" },
      ],
      values: [],
      defaults: { roleKey: "operations" },
    });
  });

  it("matches a Role column's values to the agency's roles, one by one", async () => {
    const { api } = setup(
      aPage({
        status: "matching",
        columns: [
          { ...name, guessedBy: null },
          { ...login, guessedBy: null },
          { ...designation, guessedBy: null },
        ],
        valueMatches: [
          { field: "role", value: "Telecaller", target: null, matchedBy: "none" },
          { field: "role", value: "Sales", target: "sales", matchedBy: "name" },
        ],
      }),
    );
    expect(screen.getByRole("heading", { name: "Designation's values, as roles" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Where Sales goes" })).toHaveTextContent("Sales");
    const telecaller = screen.getByRole("combobox", { name: "Where Telecaller goes" });
    expect(telecaller).toHaveTextContent("Not matched: these rows aren't added");
    await userEvent.click(telecaller);
    await userEvent.click(await screen.findByRole("option", { name: "Sales" }));
    await userEvent.click(screen.getByRole("button", { name: "Check the rows" }));
    expect(api.last().input).toMatchObject({
      values: [
        { field: "role", value: "Telecaller", target: "sales" },
        { field: "role", value: "Sales", target: "sales" },
      ],
      defaults: { roleKey: null },
    });
  });

  it("turns Check off while a needed column isn't matched, and says which", () => {
    setup(
      aPage({
        status: "matching",
        columns: [
          { ...name, guessedBy: null },
          { ...designation, guessedBy: null },
        ],
      }),
    );
    expect(screen.getByRole("button", { name: "Check the rows" })).toBeDisabled();
    const row = screen.getByText("A username or an email").closest("[role=listitem]");
    expect(row).not.toBeNull();
    expect(within(row instanceof HTMLElement ? row : document.body).getByText("Needed")).toBeVisible();
  });
});
