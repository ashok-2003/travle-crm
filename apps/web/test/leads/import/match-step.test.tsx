// Matching a lead file's columns (spec 3.2 step 2, B8-B13): the guesses are filled in, "As last time" marks the
// agency's own; a matched Owner or Stage column lists its values with their row counts; Name and a phone, email or
// Instagram are checked off; what the file leaves open is asked; Check the rows sends it all.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { MatchStep } from "@/leads/import/match-step";
import { stubApi } from "../../support/api-stub";
import { lastInputTo, renderScreen } from "../screen";
import { anImport, aColumn, asha, columns, importId, ravi, workers } from "./records";

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.leads.import;
const columnWords = messages.imports.columns;

function renderStep(overrides: Parameters<typeof anImport>[0] = {}, width: "phone" | "wide" = "phone") {
  const api = stubApi({ "leads.owners": { data: workers }, "leadImports.match": { data: null } });
  renderScreen(<MatchStep detail={anImport(overrides)} />, { width });
  return api;
}

describe("MatchStep", () => {
  it("fills the guesses, says As last time, and lists a matched Owner or Stage column's values with their counts", async () => {
    renderStep();
    expect(screen.getByRole("combobox", { name: columnWords.fieldFor.replace("{column}", "Name") })).toHaveTextContent(
      messages.imports.fields.leads.name,
    );
    expect(screen.getByRole("combobox", { name: columnWords.fieldFor.replace("{column}", "Sr No") })).toHaveTextContent(
      columnWords.dontImport,
    );
    expect(screen.getAllByText(columnWords.asLastTime)).toHaveLength(1);
    const stage = screen.getByRole("region", { name: "Status's 3 values, as stages" });
    expect(within(stage).getByText("612")).toBeVisible();
    expect(within(stage).getByText("Booked")).toBeVisible();
    expect(
      within(stage).getByRole("combobox", { name: messages.imports.values.targetFor.replace("{value}", "Booked") }),
    ).toHaveTextContent("Won");
    const owner = screen.getByRole("region", { name: "Assigned To's 2 values, as owners" });
    // The lead workers arrive after the screen does.
    await waitFor(() => {
      expect(
        within(owner).getByRole("combobox", { name: messages.imports.values.targetFor.replace("{value}", "Asha") }),
      ).toHaveTextContent("Asha Sharma");
    });
    // A value we found nobody for goes to the default.
    expect(
      within(owner).getByRole("combobox", { name: messages.imports.values.targetFor.replace("{value}", "Vikas") }),
    ).toHaveTextContent(words.match.ownerDefaultValue);
  });

  it("names the sheet and says when the file was imported before", () => {
    renderStep({ sameFile: { importedAt: "2026-10-12T10:00:00.000Z", rowsAdded: 1094 } });
    expect(screen.getByText("Sheet 'Leads Oct', the first of 3")).toBeVisible();
    expect(screen.getByText(/You imported this file on 12 Oct \(1,094 leads added\)/)).toBeVisible();
  });

  it("checks off Name and a phone, email or Instagram, and asks what the file leaves open", async () => {
    renderStep({ columns: [aColumn(0, "Customer", { field: "name" }), aColumn(1, "Amount", { field: "budget" })] });
    const check = screen.getByRole("button", { name: words.match.check });
    // The name is matched, a contact is not: nothing can be checked yet.
    expect(check).toBeDisabled();
    expect(screen.getByRole("combobox", { name: words.match.stageQuestion })).toHaveTextContent("New");
    expect(screen.getByRole("combobox", { name: words.match.ownerQuestion })).toHaveTextContent(
      words.match.ownerDefault,
    );
    // A Budget column with no basis column asks whether budgets are per person.
    expect(screen.getByRole("radio", { name: words.match.forEveryone })).toBeChecked();
    expect(screen.getByRole("radio", { name: words.match.perPerson })).not.toBeChecked();
    await userEvent.click(screen.getByRole("combobox", { name: columnWords.fieldFor.replace("{column}", "Amount") }));
    await userEvent.click(await screen.findByRole("option", { name: messages.imports.fields.leads.phone }));
    expect(check).toBeEnabled();
    // No budget column left: the question goes.
    expect(screen.queryByRole("radio", { name: words.match.perPerson })).toBeNull();
  });

  it("sends match with the columns, the values changed and the defaults when Check the rows is pressed", async () => {
    renderStep();
    const owner = screen.getByRole("region", { name: "Assigned To's 2 values, as owners" });
    await userEvent.click(
      within(owner).getByRole("combobox", { name: messages.imports.values.targetFor.replace("{value}", "Vikas") }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Ravi Kumar" }));
    await userEvent.click(screen.getByRole("combobox", { name: words.match.stageQuestion }));
    await userEvent.click(await screen.findByRole("option", { name: "Contacted" }));
    await userEvent.click(screen.getByRole("combobox", { name: words.match.ownerQuestion }));
    await userEvent.click(await screen.findByRole("option", { name: "Asha Sharma" }));
    await userEvent.click(screen.getByRole("button", { name: words.match.check }));
    expect(lastInputTo("leadImports.match")).toEqual({
      importId,
      columns: columns.map((column) => ({ position: column.position, field: column.field })),
      // Only Vikas was changed by the importer; the automatic matches are the api's already.
      values: [{ field: "owner", value: "Vikas", target: ravi }],
      defaults: { stage: "contacted", ownerUserId: asha, budgetBasis: null },
    });
  });

  it("says a column of more than fifty values is matched at the check", () => {
    renderStep({
      columns: [
        aColumn(0, "Name", { field: "name" }),
        aColumn(1, "Phone", { field: "phone" }),
        aColumn(2, "Agent", { field: "owner", values: null, samples: ["Asha"] }),
      ],
    });
    expect(screen.getByText(words.match.manyValues.replace("{column}", "Agent"))).toBeVisible();
  });

  it("shows a table of the columns on a computer", () => {
    renderStep({}, "wide");
    expect(screen.getByRole("columnheader", { name: columnWords.importAs })).toBeVisible();
  });

  it("shows the refusal's sentence when the api refuses the match", async () => {
    stubApi({
      "leads.owners": { data: workers },
      "leadImports.match": { status: 400, reason: "IMPORT_NEEDS_NAME_AND_CONTACT" },
    });
    renderScreen(<MatchStep detail={anImport()} />);
    await userEvent.click(screen.getByRole("button", { name: words.match.check }));
    expect(await screen.findByText(messages.errors.reasons.IMPORT_NEEDS_NAME_AND_CONTACT)).toBeVisible();
  });
});
