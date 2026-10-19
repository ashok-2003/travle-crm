// The rows a sheet couldn't add (S27): row, name or value, the reason in words, first seen in the agency's zone and Hide,
// a Table on a computer and a list on a phone, fifty at a time; and the line that says to fix the row in the sheet.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { SheetProblems } from "@/lead-sources/sheet/sheet-problems";
import { renderScreen, inputsTo } from "../../leads/screen";
import { stubApi } from "../../support/api-stub";
import { sheetId } from "../records";

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.sheets.sheet.problems;
const reasons = messages.sheets.reasons;
const problem = (id: string, rowNumber: number, overrides: Record<string, unknown> = {}) => ({
  id,
  rowNumber,
  name: "Rahul Sharma",
  value: null,
  reason: "no_contact",
  firstSeenAt: "2026-10-18T05:00:00.000Z",
  ...overrides,
});

describe("SheetProblems", () => {
  it("lists the problems with row, name, reason and first seen, and hides one", async () => {
    const api = stubApi({
      "leadSheets.problems": {
        data: {
          items: [problem("a", 87), problem("b", 212, { name: null, value: "9876543210", reason: "blocked" })],
          nextCursor: null,
        },
      },
      "leadSheets.hideProblem": { data: null },
    });
    renderScreen(<SheetProblems sheetId={sheetId} />, { width: "wide" });
    const table = await screen.findByRole("table", { name: words.listLabel });
    const [first, second] = within(table).getAllByRole("row").slice(1);
    expect(first).toHaveTextContent("87Rahul Sharma" + reasons.no_contact + "18 Oct");
    expect(second).toHaveTextContent("9876543210" + reasons.blocked);
    expect(screen.getByText(words.help)).toBeVisible();
    api.answer("leadSheets.problems", {
      data: { items: [problem("b", 212, { name: null, value: "9876543210", reason: "blocked" })], nextCursor: null },
    });
    await userEvent.click(screen.getByRole("button", { name: "Hide row 87" }));
    await waitFor(() => {
      expect(inputsTo("leadSheets.hideProblem")).toEqual([{ sheetId, rowId: "a" }]);
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Hide row 87" })).toBeNull();
    });
  });

  it("shows a list on a phone, with the reason and the day", async () => {
    stubApi({ "leadSheets.problems": { data: { items: [problem("a", 87)], nextCursor: null } } });
    renderScreen(<SheetProblems sheetId={sheetId} />, { width: "phone" });
    const list = await screen.findByRole("list", { name: words.listLabel });
    expect(within(list).getByText("Row 87 · Rahul Sharma")).toBeVisible();
    expect(within(list).getByText(`${reasons.no_contact} · first seen 18 Oct`)).toBeVisible();
  });

  it("shows fifty at a time with Show more", async () => {
    const api = stubApi({
      "leadSheets.problems": {
        data: {
          items: Array.from({ length: 50 }, (_, index) => problem(`p${String(index)}`, index + 1)),
          nextCursor: "p49",
        },
      },
    });
    renderScreen(<SheetProblems sheetId={sheetId} />, { width: "wide" });
    expect(await screen.findAllByRole("button", { name: /^Hide row/ })).toHaveLength(50);
    api.answer("leadSheets.problems", { data: { items: [problem("p50", 51)], nextCursor: null } });
    await userEvent.click(screen.getByRole("button", { name: words.more }));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /^Hide row/ })).toHaveLength(51);
    });
    expect(inputsTo("leadSheets.problems").at(-1)).toEqual({ sheetId, after: "p49" });
  });

  it("shows the error with Try again", async () => {
    stubApi({ "leadSheets.problems": { status: 500 } });
    renderScreen(<SheetProblems sheetId={sheetId} />, { width: "wide" });
    expect(await screen.findByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
