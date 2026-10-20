// Step 3 of connecting (spec 6.5): what to do with the rows already in the sheet. Two choices, "only new rows" chosen; a
// sheet with no rows skips the step; a bigger one says how many can be checked; Connect the sheet asks once, holds the
// dialog while it sends, and sends the choice and then the confirmation.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { ExistingStep } from "@/lead-sources/connect/existing-step";
import { renderScreen, inputsTo } from "../../leads/screen";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { aColumnsView, aSheetDetail, sheetId } from "../records";

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.sheets.connect.existing;
const detail = aSheetDetail({ status: "connecting", step: "existing" });

function renderStep(rowCount = 1286, extra: Parameters<typeof stubApi>[0] = {}) {
  return (
    stubApi({
      "leadSheets.verify": { data: aColumnsView({ rowCount }) },
      "leadSheets.chooseExisting": { data: null },
      "leadSheets.confirm": { data: null },
      "leadSheets.get": { data: detail },
      ...extra,
    }),
    renderScreen(<ExistingStep detail={detail} />)
  );
}

describe("ExistingStep", () => {
  it("offers the two choices, with 'only new rows' chosen, and says how many rows there are", async () => {
    renderStep();
    expect(await screen.findByText("Your sheet already has 1,286 rows. What should we do with them?")).toBeVisible();
    expect(screen.getByText("Step 3 of 3 · Existing rows")).toBeVisible();
    expect(screen.getByRole("radio", { name: words.onlyNew })).toBeChecked();
    expect(screen.getByRole("radio", { name: words.check.replace("{count}", "1,286") })).not.toBeChecked();
    expect(screen.getByText(words.note)).toBeVisible();
  });

  it("says the newest 10,000 can be checked for a bigger sheet", async () => {
    renderStep(14_200);
    expect(await screen.findByText("Your sheet has 14,200 rows; the newest 10,000 can be checked.")).toBeVisible();
  });

  it("skips the step for an empty sheet, and connects it as it is", async () => {
    renderStep(0);
    await waitFor(() => {
      expect(inputsTo("leadSheets.confirm")).toEqual([{ sheetId }]);
    });
    expect(inputsTo("leadSheets.chooseExisting")).toEqual([{ sheetId, existingRows: "only_new" }]);
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("shows why an empty sheet could not be connected, and tries again on request", async () => {
    renderStep(0, { "leadSheets.confirm": { status: 409, reason: "SHEET_NOT_READY" } });
    expect(await screen.findByText(messages.errors.reasons.SHEET_NOT_READY)).toBeVisible();
    expect(screen.queryByText(words.reading)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    await waitFor(() => {
      expect(inputsTo("leadSheets.confirm")).toHaveLength(2);
    });
  });

  it("does not connect an empty sheet by itself while the agency is read-only", async () => {
    stubApi({ "leadSheets.verify": { data: aColumnsView({ rowCount: 0 }) } });
    screenIs("phone");
    renderWithApi(
      <ExistingStep detail={detail} />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
    );
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(inputsTo("leadSheets.chooseExisting")).toEqual([]);
    expect(inputsTo("leadSheets.confirm")).toEqual([]);
  });

  it("says the sheet's rows could not be read, with Try again, when reading fails", async () => {
    renderStep(1, { "leadSheets.verify": { status: 502 } });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
  });

  it("asks once before connecting, then sends the choice and the confirmation", async () => {
    renderStep();
    await userEvent.click(await screen.findByRole("radio", { name: words.check.replace("{count}", "1,286") }));
    await userEvent.click(screen.getByRole("button", { name: words.connect }));
    const asking = await screen.findByRole("alertdialog", { name: "Connect ‘Goa Diwali campaign’?" });
    expect(within(asking).getByText(words.confirmDescription)).toBeVisible();
    expect(inputsTo("leadSheets.confirm")).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: words.confirmAction }));
    await waitFor(() => {
      expect(inputsTo("leadSheets.confirm")).toEqual([{ sheetId }]);
    });
    expect(inputsTo("leadSheets.chooseExisting")).toEqual([{ sheetId, existingRows: "check" }]);
  });

  it("holds the dialog while the request is out", async () => {
    const held = heldAnswer({ data: null });
    renderStep(1286, { "leadSheets.confirm": held.answer });
    await userEvent.click(await screen.findByRole("button", { name: words.connect }));
    const asking = await screen.findByRole("alertdialog");
    await userEvent.click(within(asking).getByRole("button", { name: words.confirmAction }));
    await waitFor(() => {
      expect(within(asking).getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    });
    held.release();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("shows a refusal inside the dialog and leaves it open", async () => {
    renderStep(1286, { "leadSheets.confirm": { status: 409, reason: "SHEET_NOT_READY" } });
    await userEvent.click(await screen.findByRole("button", { name: words.connect }));
    const asking = await screen.findByRole("alertdialog");
    await userEvent.click(within(asking).getByRole("button", { name: words.confirmAction }));
    expect(await within(asking).findByText(messages.errors.reasons.SHEET_NOT_READY)).toBeVisible();
  });

  it("disables Connect the sheet with the hint while the agency is read-only", async () => {
    stubApi({ "leadSheets.verify": { data: aColumnsView() } });
    screenIs("phone");
    renderWithApi(
      <ExistingStep detail={detail} />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
    );
    const connect = await screen.findByRole("button", { name: words.connect });
    expect(connect).toBeDisabled();
    expect(connect).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
  });
});
