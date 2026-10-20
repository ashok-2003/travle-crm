// Step 2 of connecting (spec 6.5): the sheet's columns with their guesses, "As last time", no Stage, Name and a contact
// checked off with Next off until they are matched, the tabs of a sheet with several, an Owner column's values with their
// rows, and Next sending the match. Opened again from the sheet's page it asks before saving.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { ColumnsStep } from "@/lead-sources/connect/columns-step";
import { renderScreen, lastInputTo, inputsTo } from "../../leads/screen";
import { routerCalls } from "../../leads/navigation";
import { stubApi } from "../../support/api-stub";
import { asha, ravi, workers } from "../../leads/import/records";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { aColumnsView, aSheetDetail, sheetId } from "../records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.sheets.connect.columns;
const columnWords = messages.imports.columns;
const fieldFor = (column: string) => columnWords.fieldFor.replace("{column}", column);

function renderStep(view = aColumnsView(), props: Parameters<typeof ColumnsStep>[0] | null = null) {
  const api = stubApi({
    "leads.owners": { data: workers },
    "leadSheets.verify": { data: view },
    "leadSheets.match": { data: null },
    "leadSheets.chooseTab": { data: null },
    "leadSheets.get": { data: aSheetDetail({ status: "connecting", step: "existing" }) },
  });
  renderScreen(<ColumnsStep {...(props ?? { detail: aSheetDetail({ status: "connecting", step: "columns" }) })} />);
  return api;
}

describe("ColumnsStep", () => {
  it("reads the sheet, then fills the guesses, and says As last time for the agency's own", async () => {
    renderStep(
      aColumnsView({
        columns: aColumnsView().columns.map((column) =>
          column.headerKey === "whatsapp" ? { ...column, guessedBy: "last-time" as const } : column,
        ),
      }),
    );
    expect(screen.getByText(words.reading)).toBeVisible();
    expect(await screen.findByRole("combobox", { name: fieldFor("Full name") })).toHaveTextContent(
      messages.imports.fields.leads.name,
    );
    expect(screen.getByRole("combobox", { name: fieldFor("Timestamp") })).toHaveTextContent(
      messages.imports.fields.leads.enquiry_date,
    );
    expect(screen.getByRole("combobox", { name: fieldFor("Handled by") })).toHaveTextContent(columnWords.dontImport);
    expect(screen.getAllByText(columnWords.asLastTime)).toHaveLength(1);
    expect(
      screen.getByText(
        "Sheet ‘Goa Diwali campaign (Responses)’, tab ‘Form responses 1’. Say what each column holds; we remember it.",
      ),
    ).toBeVisible();
  });

  it("never offers Stage, and checks off Name and a phone, keeping Next off until both are matched", async () => {
    renderStep(
      aColumnsView({
        columns: aColumnsView().columns.map((column) =>
          column.headerKey === "whatsapp" ? { ...column, field: null } : column,
        ),
      }),
    );
    const next = await screen.findByRole("button", { name: words.next });
    expect(next).toBeDisabled();
    expect(screen.getByRole("heading", { level: 2, name: words.notReady })).toBeVisible();
    await userEvent.click(screen.getByRole("combobox", { name: fieldFor("Handled by") }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).not.toContain(messages.imports.fields.leads.stage);
    await userEvent.click(screen.getByRole("option", { name: messages.imports.fields.leads.phone }));
    expect(next).toBeEnabled();
    expect(screen.getByRole("heading", { level: 2, name: words.ready })).toBeVisible();
  });

  it("lists the tabs of a sheet with several, and not for one", async () => {
    const view = aColumnsView({
      tabs: [
        { gid: "0", title: "Form responses 1" },
        { gid: "9", title: "Archive" },
      ],
    });
    const api = renderStep(view);
    const tab = await screen.findByRole("combobox", { name: words.tab });
    expect(tab).toHaveTextContent("Form responses 1");
    await userEvent.click(tab);
    await userEvent.click(await screen.findByRole("option", { name: "Archive" }));
    await waitFor(() => {
      expect(lastInputTo("leadSheets.chooseTab")).toEqual({ sheetId, tabGid: "9" });
    });
    api.answer("leadSheets.verify", { data: aColumnsView() });
  });

  it("confirms the link's own tab first when the draft is still at its tab step, then reads the columns", async () => {
    renderStep(aColumnsView(), { detail: aSheetDetail({ status: "connecting", step: "tab" }) });
    await waitFor(() => {
      expect(inputsTo("leadSheets.chooseTab")).toEqual([{ sheetId, tabGid: "0" }]);
    });
    // The columns are read once the tab is confirmed and the sheet has moved on.
    expect(inputsTo("leadSheets.verify")).toEqual([]);
  });

  it("does not show the tab choice for one tab", async () => {
    renderStep();
    await screen.findByRole("button", { name: words.next });
    expect(screen.queryByRole("combobox", { name: words.tab })).toBeNull();
  });

  it("lists an Owner column's values with their rows and an automatic match, and sends only what was changed", async () => {
    const view = aColumnsView({
      columns: aColumnsView().columns.map((column) =>
        column.headerKey === "handledby" ? { ...column, field: "owner" as const } : column,
      ),
      ownerValues: [
        { value: "Asha", rows: 41, target: asha, matchedBy: "name" },
        { value: "Neha", rows: 63, target: null, matchedBy: "none" },
      ],
    });
    renderStep(view);
    const owner = await screen.findByRole("region", { name: /Handled by/ });
    expect(within(owner).getByText("41")).toBeVisible();
    expect(within(owner).getByText("63")).toBeVisible();
    await waitFor(() => {
      expect(
        within(owner).getByRole("combobox", { name: messages.imports.values.targetFor.replace("{value}", "Asha") }),
      ).toHaveTextContent("Asha Sharma");
    });
    await userEvent.click(
      within(owner).getByRole("combobox", { name: messages.imports.values.targetFor.replace("{value}", "Neha") }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Ravi Kumar" }));
    await userEvent.click(screen.getByRole("button", { name: words.next }));
    await waitFor(() => {
      expect(lastInputTo("leadSheets.match")).toEqual({
        sheetId,
        columns: [
          { headerKey: "timestamp", field: "enquiry_date" },
          { headerKey: "fullname", field: "name" },
          { headerKey: "whatsapp", field: "phone" },
          { headerKey: "handledby", field: "owner" },
        ],
        values: [{ value: "Neha", target: ravi }],
      });
    });
    // The Owner column's values were asked for by its key.
    expect(inputsTo("leadSheets.verify").at(-1)).toEqual({ sheetId, valuesOf: "handledby" });
  });

  it("says a column of too many values goes to the agency Owner", async () => {
    renderStep(
      aColumnsView({
        columns: aColumnsView().columns.map((column) =>
          column.headerKey === "handledby" ? { ...column, field: "owner" as const } : column,
        ),
        ownerValues: null,
      }),
    );
    expect(await screen.findByText(words.manyValues.replace("{column}", "Handled by"))).toBeVisible();
  });

  it("shows the sentence of a refusal, and Google being busy while reading", async () => {
    stubApi({ "leads.owners": { data: workers }, "leadSheets.verify": { status: 409, reason: "SHEETS_UNAVAILABLE" } });
    renderScreen(<ColumnsStep detail={aSheetDetail({ status: "connecting", step: "columns" })} />);
    expect(await screen.findByText(messages.errors.reasons.SHEETS_UNAVAILABLE)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });

  it("asks before saving a new match of a connected sheet, then goes back to its page", async () => {
    renderStep(aColumnsView(), { detail: aSheetDetail(), matchingAgain: true });
    await userEvent.click(await screen.findByRole("button", { name: messages.sheets.sheet.matchAgainDialog.action }));
    const asking = await screen.findByRole("alertdialog", { name: messages.sheets.sheet.matchAgainDialog.title });
    expect(inputsTo("leadSheets.match")).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: messages.sheets.sheet.matchAgainDialog.action }));
    await waitFor(() => {
      expect(routerCalls.push).toHaveBeenCalledWith(`/settings/lead-sources/sheets/${sheetId}`);
    });
  });

  it("disables Next with the hint while the agency is read-only", async () => {
    stubApi({ "leads.owners": { data: workers }, "leadSheets.verify": { data: aColumnsView() } });
    screenIs("phone");
    renderWithApi(
      <ColumnsStep detail={aSheetDetail({ status: "connecting", step: "columns" })} />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
    );
    const next = await screen.findByRole("button", { name: words.next });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
  });
});
