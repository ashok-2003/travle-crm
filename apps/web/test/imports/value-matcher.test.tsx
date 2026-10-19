// Matching a column's values (spec 3.2 step 2, B11): each value with how many rows hold it, in mono at the end, and its
// own Select of where it goes, the default first; then, if the feature asks, what the rows with an empty cell get. The
// heading starts where its rows' words do (W14).
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { ValueMatcher } from "@/imports/value-matcher";
import { renderAs, screenIs } from "../organization/render";

const words = messages.imports.values;
const asha = "0199e7a0-0000-7000-8000-00000000a5a1";
const ravi = "0199e7a0-0000-7000-8000-00000000a5a2";

beforeEach(() => {
  screenIs("wide");
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

describe("ValueMatcher", () => {
  it("lists a column's values with their counts in mono, each with its own Select", async () => {
    const onChoose = vi.fn<(value: string, target: string | null) => void>();
    renderAs(
      <ValueMatcher
        heading="Assigned To"
        values={[
          { value: "Asha", rows: 1512 },
          { value: "Vikas", rows: 85 },
        ]}
        targets={[
          { value: asha, label: "Asha Sharma" },
          { value: ravi, label: "Ravi Kumar" },
        ]}
        chosen={new Map([["Asha", asha]])}
        onChoose={onChoose}
        defaultLabel="Asha Sharma (Owner), the default"
      />,
    );
    expect(screen.getByRole("heading", { name: "Assigned To" })).toBeVisible();
    const count = screen.getByText("1,512");
    expect(count).toHaveClass("numbers");
    const vikas = screen.getByRole("combobox", { name: words.targetFor.replace("{value}", "Vikas") });
    expect(vikas).toHaveTextContent("Asha Sharma (Owner), the default");
    expect(screen.getByRole("combobox", { name: words.targetFor.replace("{value}", "Asha") })).toHaveTextContent(
      "Asha Sharma",
    );
    await userEvent.click(vikas);
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Asha Sharma (Owner), the default");
    await userEvent.click(within(document.body).getByRole("option", { name: "Ravi Kumar" }));
    expect(onChoose).toHaveBeenLastCalledWith("Vikas", ravi);
  });

  it("ends with what rows with an empty cell get, a row like the values' with its hint, and lines its heading up", async () => {
    const onBlank = vi.fn<(target: string | null) => void>();
    renderAs(
      <ValueMatcher
        heading="Designation's values, as roles"
        values={[{ value: "Sales", rows: 4 }]}
        targets={[
          { value: "sales", label: "Sales" },
          { value: "accounts", label: "Accounts" },
        ]}
        chosen={new Map([["Sales", "sales"]])}
        onChoose={() => undefined}
        defaultLabel="Not matched: these rows aren't added"
        blank={{
          label: "Rows with no role get",
          hint: "Optional. A row with an empty Role cell gets this role.",
          chosen: null,
          noneLabel: "Not matched: these rows aren't added",
          onChoose: onBlank,
        }}
      />,
    );
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const blank = rows[1];
    if (blank === undefined) throw new Error("The empty cells' row is missing");
    expect(blank).toHaveTextContent("Rows with no role get");
    const select = within(blank).getByRole("combobox", { name: "Rows with no role get" });
    expect(select).toHaveTextContent("Not matched: these rows aren't added");
    expect(select).toHaveAccessibleDescription("Optional. A row with an empty Role cell gets this role.");
    await userEvent.click(select);
    await userEvent.click(within(document.body).getByRole("option", { name: "Accounts" }));
    expect(onBlank).toHaveBeenLastCalledWith("accounts");
    // The heading starts where the rows' words do: the registry Item's own inset.
    expect(screen.getByRole("heading", { name: "Designation's values, as roles" })).toHaveClass("px-3");
    expect(blank).toHaveClass("px-3");
  });
});
