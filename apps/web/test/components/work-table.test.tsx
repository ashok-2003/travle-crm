// A list of work as a table (web revamp part 2): fixed widths and text columns that share the rest above a minimum,
// the Customer column pinned left, the buttons right and the header row on top, all in a box of its own that scrolls;
// on a phone the same rows stacked, five and Show more.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClampedText, WorkTable, type WorkColumn } from "@/components/work-table";
import { screenIs } from "../organization/render";

interface Row {
  id: string;
  name: string;
  task: string;
  due: string;
}

const rows: Row[] = Array.from({ length: 7 }, (_, index) => ({
  id: String(index),
  name: `Customer ${String(index + 1)}`,
  task: `Task ${String(index + 1)}`,
  due: "4:00 pm",
}));

const columns: WorkColumn<Row>[] = [
  { header: "Customer", width: 200, cell: (row) => <a href={`/leads/${row.id}`}>{row.name}</a> },
  { header: "Task", cell: (row) => <ClampedText text={row.task} /> },
  { header: "Details", min: 240, cell: () => null },
  { header: "Due", width: 150, cell: (row) => row.due },
];

function renderTable(after: React.ReactNode = <button type="button">Next page</button>) {
  return render(
    <WorkTable
      label="Overdue"
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
      actions={{
        header: "Actions",
        width: 100,
        cell: (row) => <button type="button">{`Done: ${row.task}`}</button>,
      }}
      more="Show more overdue"
      after={after}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkTable", () => {
  it("on a wide screen is a named table with its headers in order and a hidden one over the buttons", () => {
    screenIs("wide");
    renderTable();
    const table = screen.getByRole("table", { name: "Overdue" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Customer", "Task", "Details", "Due", "Actions"]);
    expect(headers[4]).toContainElement(within(table).getByText("Actions"));
    expect(within(table).getByText("Actions")).toHaveClass("sr-only");
    expect(within(table).getAllByRole("row")).toHaveLength(8);
  });

  it("fixes the set widths, leaves the text columns to share the rest, and is at least as wide as their sum", () => {
    screenIs("wide");
    renderTable();
    const table = screen.getByRole("table", { name: "Overdue" });
    expect(table).toHaveClass("table-fixed");
    const [customer, task, details, due, actions] = within(table).getAllByRole("columnheader");
    expect(customer).toHaveStyle({ width: "200px" });
    expect(due).toHaveStyle({ width: "150px" });
    expect(actions).toHaveStyle({ width: "100px" });
    expect(task?.style.width).toBe("");
    expect(details?.style.width).toBe("");
    // 200 + 150 + 100 fixed, and the text columns' minimums: 180 by default, 240 for Details.
    expect(table).toHaveStyle({ minWidth: "870px" });
  });

  it("pins the header row, the Customer column at the left and the buttons at the right", () => {
    screenIs("wide");
    renderTable();
    const table = screen.getByRole("table", { name: "Overdue" });
    const [customer, task, , , actions] = within(table).getAllByRole("columnheader");
    for (const header of [customer, task, actions]) expect(header).toHaveClass("sticky", "top-0", "bg-background");
    expect(customer).toHaveClass("left-0");
    expect(actions).toHaveClass("right-0");
    const cell = screen.getByRole("link", { name: "Customer 1" }).closest("td");
    expect(cell).toHaveClass("sticky", "left-0", "bg-background");
    const buttons = screen.getByRole("button", { name: "Done: Task 1" }).closest("td");
    expect(buttons).toHaveClass("sticky", "right-0", "bg-background");
  });

  it("scrolls inside its own box, holding the next page's button after the rows", () => {
    screenIs("wide");
    const { container } = renderTable();
    const box = container.querySelector("[data-slot=work-table]");
    expect(box).toHaveClass("overflow-auto");
    expect(box).toContainElement(screen.getByRole("button", { name: "Next page" }));
    // Every row shows: the box scrolls rather than capping them.
    expect(screen.getByRole("link", { name: "Customer 7" })).toBeVisible();
  });

  it("stops long text at three lines, with the whole of it in its title", () => {
    render(<ClampedText text="Ask about passport copies for all 6 travellers" />);
    const text = screen.getByText("Ask about passport copies for all 6 travellers");
    expect(text).toHaveClass("line-clamp-3");
    expect(text).toHaveAttribute("title", "Ask about passport copies for all 6 travellers");
  });

  it("on a phone stacks each row's cells over its buttons, five rows and then Show more", async () => {
    screenIs("phone");
    renderTable();
    expect(screen.queryByRole("table")).toBeNull();
    const list = screen.getByRole("list", { name: "Overdue" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    const [first] = items;
    expect(first).toContainElement(screen.getByRole("link", { name: "Customer 1" }));
    expect(first).toContainElement(screen.getByText("Task 1"));
    expect(first).toContainElement(screen.getByRole("button", { name: "Done: Task 1" }));
    // The next page's button waits until the rows held back are shown.
    expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show more overdue" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Next page" })).toBeVisible();
  });
});
