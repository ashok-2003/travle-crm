// Step 3 (spec 3.2): the preview's groups with their counts and examples, the choices sent without a new check, Add
// asking once, Change the columns, Cancel this import, and a Google Sheet's extras (N8): where its rows came from, the
// stage rows with none get, and the rows already in the CRM.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { CheckStep } from "@/leads/import/check-step";
import { LeadImportScreen } from "@/leads/import/lead-import-screen";
import { routes } from "@/lib/routes";
import { stubApi, type Answer } from "../../support/api-stub";
import { routerCalls } from "../navigation";
import { inputsTo, lastInputTo, renderScreen } from "../screen";
import { aCheckedImport, anImport, counts, importId } from "./records";

vi.mock("next/navigation", () => import("../navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.leads.import.check;
const noop = () => undefined;

function renderCheck(detail = aCheckedImport(), answers: Record<string, Answer> = {}, onChangeColumns = noop) {
  const api = stubApi({
    "leadImports.decide": { data: null },
    "leadImports.add": { data: null },
    "leadImports.cancel": { data: null },
    "leadImports.match": { data: null },
    "leadImports.rows": {
      data: {
        items: [
          { rowNumber: 14, name: "Manoj Tiwari", value: null, reasons: [{ code: "no_contact" }], outcome: null },
          { rowNumber: 87, name: null, value: null, reasons: [{ code: "no_contact" }], outcome: null },
        ],
        nextCursor: null,
      },
    },
    ...answers,
  });
  renderScreen(<CheckStep detail={detail} onChangeColumns={onChangeColumns} />);
  return api;
}

describe("CheckStep", () => {
  it("shows a bar while the rows are checked", () => {
    renderCheck(
      anImport({
        status: "checking",
        progress: { rowsTotal: 1286, rowsToAdd: 0, rowsDone: 400, rowsAdded: 0, addRequestedAt: null },
      }),
    );
    expect(screen.getByText("Checking 1,286 rows…")).toBeVisible();
    expect(screen.getByText("400 of 1,286 rows")).toBeVisible();
  });

  it("groups the preview: Will be added, Your choice, Won't be added with five examples, New destinations, the quiet line", async () => {
    renderCheck();
    const added = screen.getByRole("heading", { name: words.willBeAdded }).closest<HTMLElement>("[data-slot=card]");
    if (!added) throw new Error("no card around Will be added");
    expect(within(added).getByText("1,094")).toBeVisible();
    expect(within(added).getByText("41 of them returning customers")).toBeVisible();
    expect(within(added).getByText("63")).toBeVisible();
    expect(within(added).getByText("38")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Add the 12 rows from blocked contacts anyway" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Add the 13 rows already imported again" })).not.toBeChecked();
    expect(screen.getByText(/104/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: /No phone, email or Instagram/ }));
    expect(await screen.findByText("Row 14 · Manoj Tiwari")).toBeVisible();
    expect(screen.getByText("Row 87")).toBeVisible();
    expect(screen.getByText("and 69 more")).toBeVisible();
    expect(lastInputTo("leadImports.rows")).toEqual({ importId, plan: "not_added", reason: "no_contact", limit: 5 });
    expect(screen.getByText(words.fixThem)).toBeVisible();
    expect(
      screen.getByText("Gulmarg, Pahalgam, Coorg, Spiti and Rann of Kutch will be added to your destinations."),
    ).toBeVisible();
    expect(screen.getByText(/755 leads will be New/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add 1,157 rows" })).toBeEnabled();
  });

  it("asks 'Add 1,094 leads and 63 repeat enquiries? Imported leads can't be removed in bulk later.' and sends add", async () => {
    renderCheck();
    await userEvent.click(screen.getByRole("button", { name: "Add 1,157 rows" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Add 1,094 leads and 63 repeat enquiries?")).toBeVisible();
    expect(within(dialog).getByText(/Imported leads can't be removed in bulk later\./)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: words.confirmAction }));
    await waitFor(() => {
      expect(inputsTo("leadImports.add")).toEqual([{ importId }]);
    });
  });

  it("ticks Add them anyway and Add them again through decide, without a new check", async () => {
    // Through the import's own screen, which asks for the import again after each tick, as it does when used.
    const api = stubApi({
      "leadImports.get": { data: aCheckedImport() },
      "leadImports.decide": { data: null },
      "leadImports.match": { data: null },
    });
    renderScreen(<LeadImportScreen importId={importId} />);
    const blocked = await screen.findByRole("checkbox", { name: "Add the 12 rows from blocked contacts anyway" });
    // What the api will say once the choice is kept.
    api.answer("leadImports.get", {
      data: aCheckedImport({ choices: { addBlocked: true, addAlreadyImported: false, addInCrm: false } }),
    });
    await userEvent.click(blocked);
    expect(lastInputTo("leadImports.decide")).toEqual({
      importId,
      addBlocked: true,
      addAlreadyImported: false,
      addInCrm: false,
    });
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Add the 12 rows from blocked contacts anyway" })).toBeChecked();
    });
    await userEvent.click(screen.getByRole("checkbox", { name: "Add the 13 rows already imported again" }));
    expect(lastInputTo("leadImports.decide")).toEqual({
      importId,
      addBlocked: true,
      addAlreadyImported: true,
      addInCrm: false,
    });
    // The button counts the rows ticked.
    expect(await screen.findByRole("button", { name: "Add 1,182 rows" })).toBeVisible();
    expect(inputsTo("leadImports.match")).toEqual([]);
  });

  it("goes back to the columns with Change the columns, and cancels with Cancel this import", async () => {
    const back = vi.fn();
    renderCheck(aCheckedImport(), {}, back);
    await userEvent.click(screen.getByRole("button", { name: words.changeColumns }));
    expect(back).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: words.cancelImport }));
    await waitFor(() => {
      expect(inputsTo("leadImports.cancel")).toEqual([{ importId }]);
      expect(routerCalls.push).toHaveBeenCalledWith(routes.leadImport);
    });
  });

  it("shows the refusal's sentence when Add is refused", async () => {
    renderCheck(aCheckedImport(), { "leadImports.add": { status: 409, reason: "IMPORT_ALREADY_RUNNING" } });
    await userEvent.click(screen.getByRole("button", { name: "Add 1,157 rows" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: words.confirmAction }));
    expect(await within(dialog).findByText(messages.errors.reasons.IMPORT_ALREADY_RUNNING)).toBeVisible();
  });

  it("says a sheet's rows came from the sheet, asks its stage default again, and groups the rows already in the CRM", async () => {
    renderCheck(
      aCheckedImport({
        sourceSheet: { sheetId: "0199e7a0-0000-7000-8000-0000000000f1" },
        counts: { ...counts, byPlan: { ...counts.byPlan, in_crm: 212 }, inCrm: { open: 140, closed: 72 } },
      }),
    );
    expect(screen.getByText(messages.leads.import.fromSheet)).toBeVisible();
    expect(
      screen.getByText(
        "212 rows are for people who already have a lead with you (140 with an open lead, 72 with only closed leads). Left out unless you tick them.",
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("checkbox", { name: "Add the 212 rows for people already in your CRM" }));
    expect(lastInputTo("leadImports.decide")).toMatchObject({ addInCrm: true });
    await userEvent.click(screen.getByRole("combobox", { name: messages.leads.import.match.stageQuestion }));
    await userEvent.click(await screen.findByRole("option", { name: "Contacted" }));
    expect(lastInputTo("leadImports.match")).toMatchObject({
      importId,
      values: [],
      defaults: { stage: "contacted", ownerUserId: null, budgetBasis: null },
    });
  });

  it("leaves the sheet's extras out of a file's preview", () => {
    renderCheck();
    expect(screen.queryByText(messages.leads.import.fromSheet)).toBeNull();
    expect(screen.queryByRole("combobox", { name: messages.leads.import.match.stageQuestion })).toBeNull();
  });
});
