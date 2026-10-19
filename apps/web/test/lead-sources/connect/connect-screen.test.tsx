// A sheet's connect address (spec 6.5): the step its stored step says, so leaving and coming back finds it where it was;
// "Reading your sheet…" once it is confirmed; then the sheet's page, or the import's preview for the second choice. A
// connected sheet opened at the match address matches its columns again.
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { ConnectScreen } from "@/lead-sources/connect/connect-screen";
import { leadImportRoute, sheetRoute } from "@/lib/routes";
import { renderScreen } from "../../leads/screen";
import { routerCalls } from "../../leads/navigation";
import { workers } from "../../leads/import/records";
import { stubApi } from "../../support/api-stub";
import { aColumnsView, aSheetDetail, aSheetList, sheetId } from "../records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
  routerCalls.replace.mockClear();
});

const words = messages.sheets.connect;

function renderAt(detail: unknown, props: { matchingAgain?: boolean } = {}) {
  stubApi({
    "leadSheets.get": { data: detail },
    "leadSheets.list": { data: aSheetList() },
    "leadSheets.verify": { data: aColumnsView() },
    "leads.owners": { data: workers },
  });
  renderScreen(<ConnectScreen sheetId={sheetId} {...props} />);
}

describe("ConnectScreen", () => {
  it("opens the first step without a sheet", async () => {
    stubApi({ "leadSheets.list": { data: aSheetList() } });
    renderScreen(<ConnectScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByRole("button", { name: words.share.check })).toBeVisible();
  });

  it("opens the same step when the person leaves and comes back, by the sheet's address", async () => {
    renderAt(aSheetDetail({ status: "connecting", step: "columns" }));
    expect(await screen.findByRole("heading", { level: 1, name: words.columns.title })).toBeVisible();
    expect(screen.getByText("Step 2 of 3 · Match columns")).toBeVisible();
  });

  it("shows the rows step once the columns are matched", async () => {
    renderAt(aSheetDetail({ status: "connecting", step: "existing" }));
    expect(await screen.findByRole("heading", { level: 1, name: words.existing.title })).toBeVisible();
  });

  it("says Reading your sheet… once it is confirmed", async () => {
    renderAt(aSheetDetail({ status: "connecting", step: "done" }));
    expect(await screen.findByText(words.existing.reading)).toBeVisible();
    expect(routerCalls.replace).not.toHaveBeenCalled();
  });

  it("goes to the sheet's page once it runs, and to the import's preview for the second choice", async () => {
    renderAt(aSheetDetail({ status: "running", step: "done" }));
    await waitFor(() => {
      expect(routerCalls.replace).toHaveBeenCalledWith(sheetRoute(sheetId));
    });
    vi.unstubAllGlobals();
    routerCalls.replace.mockClear();
    const importId = "0199e7a0-0000-7000-8000-0000000000f1";
    renderAt(aSheetDetail({ status: "connecting", step: "done", existingRows: "check", existingImportId: importId }));
    await waitFor(() => {
      expect(routerCalls.replace).toHaveBeenCalledWith(leadImportRoute(importId));
    });
  });

  it("matches a connected sheet's columns again at the match address, without leaving", async () => {
    renderAt(aSheetDetail(), { matchingAgain: true });
    expect(await screen.findByRole("heading", { level: 1, name: words.columns.title })).toBeVisible();
    expect(routerCalls.replace).not.toHaveBeenCalled();
    expect(screen.queryByText(/Step 2 of 3/)).toBeNull();
  });

  it("shows the error with Try again when the sheet can't be loaded", async () => {
    stubApi({ "leadSheets.get": { status: 404, reason: "NOT_FOUND" } });
    renderScreen(<ConnectScreen sheetId={sheetId} />);
    expect(await screen.findByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
