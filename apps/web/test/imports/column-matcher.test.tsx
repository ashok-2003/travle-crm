// Matching a file's columns (spec 3.2 step 2, B8-B10, D34): each column with its name, up to three samples and a Select
// of what it holds, "Don't import" first and "As last time" for a remembered guess; a Table on a computer and an
// ItemGroup on a phone; a field another column holds shows as matched to it and can't be picked, Note excepted.
import type { ImportColumn, ImportField } from "@travel-crm/contracts/imports";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColumnMatcher } from "@/imports/column-matcher";
import { messages } from "@/i18n/messages";
import { renderAs, screenIs } from "../organization/render";

const words = messages.imports;
const labels = words.fields.leads;
const fields = (Object.keys(labels) as (keyof typeof labels)[]).map((field) => ({ field, label: labels[field] }));

const column = (position: number, header: string, overrides: Partial<ImportColumn> = {}): ImportColumn => ({
  position,
  header,
  samples: [],
  values: [],
  field: null,
  guessedBy: null,
  ...overrides,
});

const columns = [
  column(0, "Customer Name", {
    samples: ["Rahul Sharma", "Sneha Iyer", "Priya Nair"],
    field: "name",
    guessedBy: "common-name",
  }),
  column(1, "Mobile No", { samples: ["98765 43210"], field: "phone", guessedBy: "last-time" }),
  column(2, "WhatsApp", { samples: ["98765 43211"] }),
  column(3, "Remarks", { samples: ["Wants a houseboat"], field: "note", guessedBy: "common-name" }),
  column(4, "Requirement", { field: "note" }),
];
const chosenOf = (list: readonly ImportColumn[]) => new Map(list.map((item) => [item.position, item.field]));

beforeEach(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ColumnMatcher", () => {
  it("shows a Table on a computer and an ItemGroup on a phone, Don't import first, As last time where remembered", async () => {
    screenIs("wide");
    const { unmount } = renderAs(
      <ColumnMatcher columns={columns} fields={fields} chosen={chosenOf(columns)} onChoose={vi.fn()} />,
    );
    const table = screen.getByRole("table");
    for (const header of [words.columns.column, words.columns.samples, words.columns.importAs]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeVisible();
    }
    expect(within(table).getByText("Rahul Sharma · Sneha Iyer · Priya Nair")).toBeVisible();
    expect(within(table).getByText(words.columns.asLastTime)).toBeVisible();
    const phone = within(table).getByRole("combobox", {
      name: words.columns.fieldFor.replace("{column}", "Mobile No"),
    });
    expect(phone).toHaveTextContent("Phone");
    await userEvent.click(
      within(table).getByRole("combobox", { name: words.columns.fieldFor.replace("{column}", "WhatsApp") }),
    );
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options[0]).toBe(words.columns.dontImport);
    unmount();

    screenIs("phone");
    renderAs(<ColumnMatcher columns={columns} fields={fields} chosen={chosenOf(columns)} onChoose={vi.fn()} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(columns.length);
    expect(screen.getByText(words.columns.asLastTime)).toBeVisible();
  });

  it("shows a field another column holds as matched to it, and never lets two columns take it but Note", async () => {
    screenIs("wide");
    const onChoose = vi.fn<(position: number, field: ImportField | null) => void>();
    renderAs(<ColumnMatcher columns={columns} fields={fields} chosen={chosenOf(columns)} onChoose={onChoose} />);
    await userEvent.click(
      screen.getByRole("combobox", { name: words.columns.fieldFor.replace("{column}", "WhatsApp") }),
    );
    const taken = screen.getByRole("option", { name: "Phone · matched to 'Mobile No'" });
    expect(taken).toHaveAttribute("aria-disabled", "true");
    // Note takes several columns: it stays a choice.
    const note = screen.getByRole("option", { name: "Note" });
    expect(note).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("option", { name: "Email" }));
    expect(onChoose).toHaveBeenLastCalledWith(2, "email");
    await userEvent.click(
      screen.getByRole("combobox", { name: words.columns.fieldFor.replace("{column}", "Mobile No") }),
    );
    await userEvent.click(screen.getByRole("option", { name: words.columns.dontImport }));
    expect(onChoose).toHaveBeenLastCalledWith(1, null);
  });
});
