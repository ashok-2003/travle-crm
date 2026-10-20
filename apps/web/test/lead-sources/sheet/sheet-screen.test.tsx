// A connected sheet's page (spec 6.5): its name, badge and who connected it and when, Last checked in the agency's zone,
// Sync now (Checking…, running late, a second press refused), the four counts with their notes, how the columns are
// matched, the menu (Pause, Resume, Match again, Disconnect), and what stays open while the agency is read-only.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { SheetScreen } from "@/lead-sources/sheet/sheet-screen";
import { routes, sheetMatchRoute } from "@/lib/routes";
import { renderScreen, inputsTo } from "../../leads/screen";
import { routerCalls } from "../../leads/navigation";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { aSheetDetail, sheetId } from "../records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  routerCalls.push.mockClear();
});

const words = messages.sheets.sheet;
const emptyProblems = { data: { items: [], nextCursor: null } };

function renderSheet(detail = aSheetDetail(), extra: Parameters<typeof stubApi>[0] = {}) {
  const api = stubApi({
    "leadSheets.get": { data: detail },
    "leadSheets.problems": emptyProblems,
    "leadSheets.list": { data: { items: [], limit: 5, serviceAccountEmails: [], configured: true, demo: false } },
    ...extra,
  });
  renderScreen(<SheetScreen sheetId={sheetId} />, { width: "wide" });
  return api;
}

describe("SheetScreen", () => {
  it("shows the name, badge and who connected it and when, and Last checked in the agency's zone", async () => {
    renderSheet();
    expect(await screen.findByRole("heading", { level: 1, name: "Goa Diwali campaign" })).toBeVisible();
    expect(screen.getByText(messages.sheets.statuses.running)).toBeVisible();
    expect(screen.getByText("Tab ‘Form responses 1’ · connected by Asha Sharma on 12 Oct")).toBeVisible();
    expect(screen.getByText("Last checked 10:42 am · checks about every 15 minutes")).toBeVisible();
    expect(screen.getByRole("link", { name: messages.sheets.list.title })).toHaveAttribute("href", routes.leadSources);
  });

  it("names a former member, and says a sheet is not checked yet", async () => {
    renderSheet(aSheetDetail({ connectedBy: { userId: "x", name: null }, lastCheckedAt: null }));
    expect(await screen.findByText("Tab ‘Form responses 1’ · connected on 12 Oct")).toBeVisible();
    expect(screen.getByText(words.notChecked)).toBeVisible();
  });

  it("says 'Checks are running late' after thirty minutes", async () => {
    renderSheet(aSheetDetail({ late: true }));
    expect(await screen.findByText(words.late)).toBeVisible();
  });

  it("shows Checking… on Sync now while the request is out, and refuses a second press with its sentence", async () => {
    const held = heldAnswer({ data: null });
    const api = renderSheet(aSheetDetail(), { "leadSheets.syncNow": held.answer });
    const sync = await screen.findByRole("button", { name: words.syncNow });
    await userEvent.click(sync);
    expect(await screen.findByRole("button", { name: words.checking })).toBeDisabled();
    expect(inputsTo("leadSheets.syncNow")).toEqual([{ sheetId }]);
    held.release();
    await screen.findByRole("button", { name: words.syncNow });
    api.answer("leadSheets.syncNow", { status: 409, reason: "SHEET_BUSY" });
    await userEvent.click(screen.getByRole("button", { name: words.syncNow }));
    expect(await screen.findByText(messages.errors.reasons.SHEET_BUSY)).toBeVisible();
  });

  it("says Checking… while a check runs on its own", async () => {
    renderSheet(aSheetDetail({ checkRunning: true }));
    expect(await screen.findByRole("button", { name: words.checking })).toBeDisabled();
  });

  it("shows the four counts in mono and the notes under them", async () => {
    renderSheet(
      aSheetDetail({
        counts: { added: 12_145, mergedIntoExisting: 37, duplicates: 18, couldntBeAdded: 0 },
        rowsTruncated: true,
      }),
    );
    expect(await screen.findByText("12,145")).toHaveClass("numbers");
    expect(screen.getByText(words.counts.added)).toBeVisible();
    expect(screen.getByText(words.counts.mergedIntoExisting)).toBeVisible();
    expect(screen.getByText(words.counts.duplicates)).toBeVisible();
    expect(screen.getByText(words.counts.couldntBeAdded)).toBeVisible();
    expect(screen.getByText(words.counts.notes)).toBeVisible();
    expect(screen.getByText(words.counts.truncated)).toBeVisible();
    // Nothing couldn't be added: no list of problems.
    expect(screen.queryByRole("heading", { name: words.problems.heading })).toBeNull();
  });

  it("shows 6 of 9 columns matched and a quiet line for a new column, and about the sheet", async () => {
    renderSheet(
      aSheetDetail({ columns: { matched: 6, total: 9, newUnmatched: ["Budget for the trip"], missing: [] } }),
    );
    expect(await screen.findByText("6 of 9 columns are matched.")).toBeVisible();
    expect(screen.getByText(/A new column ‘Budget for the trip’ isn't matched\./)).toBeVisible();
    expect(screen.getAllByRole("link", { name: messages.sheets.sheet.columnsCard.matchAgain })[0]).toHaveAttribute(
      "href",
      sheetMatchRoute(sheetId),
    );
    expect(screen.getByText(words.details.stage)).toBeVisible();
    expect(screen.getByText("The agency Owner, Asha Sharma")).toBeVisible();
  });

  it("pauses and resumes from the menu", async () => {
    const api = renderSheet(aSheetDetail(), {
      "leadSheets.pause": { data: null },
      "leadSheets.resume": { data: null },
    });
    await userEvent.click(await screen.findByRole("button", { name: words.menu }));
    await userEvent.click(await screen.findByRole("menuitem", { name: words.pause }));
    await waitFor(() => {
      expect(inputsTo("leadSheets.pause")).toEqual([{ sheetId }]);
    });
    api.answer("leadSheets.get", { data: aSheetDetail({ status: "paused" }) });
  });

  it("disconnects after a confirmation that names what stays, and goes back to the list", async () => {
    renderSheet(aSheetDetail(), { "leadSheets.disconnect": { data: null } });
    await userEvent.click(await screen.findByRole("button", { name: words.menu }));
    await userEvent.click(await screen.findByRole("menuitem", { name: words.disconnect }));
    const asking = await screen.findByRole("alertdialog", { name: "Disconnect ‘Goa Diwali campaign’?" });
    expect(within(asking).getByText(/Leads already added stay\./)).toBeVisible();
    expect(within(asking).getByText(/crm-sheets@travelcrm-test\.iam\.gserviceaccount\.com/)).toBeVisible();
    expect(inputsTo("leadSheets.disconnect")).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: words.disconnectDialog.action }));
    await waitFor(() => {
      expect(routerCalls.push).toHaveBeenCalledWith(routes.leadSources);
    });
    expect(inputsTo("leadSheets.disconnect")).toEqual([{ sheetId }]);
  });

  it("keeps Pause and Disconnect open on a read-only agency and turns Sync now and Match again off with the hint", async () => {
    stubApi({ "leadSheets.get": { data: aSheetDetail({ readOnly: true }) }, "leadSheets.problems": emptyProblems });
    screenIs("wide");
    renderWithApi(
      <SheetScreen sheetId={sheetId} />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
    );
    const sync = await screen.findByRole("button", { name: words.syncNow });
    expect(sync).toBeDisabled();
    expect(sync).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
    expect(screen.getByText(words.attention.readOnly.title)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.menu }));
    expect(await screen.findByRole("menuitem", { name: words.pause })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: words.disconnect })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: words.matchAgain })).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the error with Try again when the sheet can't be loaded", async () => {
    stubApi({ "leadSheets.get": { status: 404, reason: "NOT_FOUND" } });
    renderScreen(<SheetScreen sheetId={sheetId} />);
    expect(await screen.findByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
