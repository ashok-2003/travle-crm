// The Leads list marks the leads the AI filled in: a violet sparkle named by its sentence right after the name, in the phone
// list and in the table, and only for those leads.
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadRows } from "@/leads/list/lead-rows";
import { LeadsTable } from "@/leads/list/leads-table";
import { stubApi } from "../support/api-stub";
import { aListItem, ids, people } from "./records";
import { renderScreen } from "./screen";

const filters = { view: "mine", stage: "open", search: "" } as never;
const mark = messages.leads.list.aiFilled;

/** The mark inside the nth of these elements, else null. */
function markIn(elements: HTMLElement[], index: number): HTMLElement | null {
  const element = elements[index];
  if (element === undefined) throw new Error(`No element ${String(index)}`);
  return within(element).queryByLabelText(mark);
}

describe("the AI-filled mark in the Leads list", () => {
  it("shows the mark with its name only for aiFilled leads, in the rows", () => {
    stubApi({});
    renderScreen(
      <LeadRows
        filters={filters}
        leads={[
          aListItem({ aiFilled: true }),
          aListItem({ id: ids.entry, aiFilled: false, person: { name: "Priya Patel", phone: null } }),
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(markIn(items, 0)).toBeVisible();
    expect(markIn(items, 1)).toBeNull();
  });

  it("shows it in the table the same way", () => {
    stubApi({});
    renderScreen(
      <LeadsTable
        people={people}
        filters={filters}
        showOwner
        leads={[
          aListItem({ aiFilled: true }),
          aListItem({ id: ids.entry, aiFilled: false, person: { name: "Priya Patel", phone: null } }),
        ]}
      />,
      { width: "wide" },
    );
    const rows = screen.getAllByRole("row");
    expect(markIn(rows, 1)).toBeVisible();
    expect(markIn(rows, 2)).toBeNull();
  });
});
