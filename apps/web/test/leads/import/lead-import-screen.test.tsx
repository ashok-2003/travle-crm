// A lead import's own address (spec 3.2): the step its status says, so leaving and coming back finds it where it was:
// reading, a file that can't be read, the columns, the preview and changing the columns from it, adding, and the end.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadImportScreen } from "@/leads/import/lead-import-screen";
import { routes } from "@/lib/routes";
import { stubApi } from "../../support/api-stub";
import { renderScreen } from "../screen";
import { aCheckedImport, anImport, asha, columns, importId, ravi, workers } from "./records";

vi.mock("next/navigation", () => import("../navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.leads.import;

function renderImport(detail: unknown) {
  stubApi({ "leadImports.get": { data: detail }, "leads.owners": { data: workers } });
  renderScreen(<LeadImportScreen importId={importId} />);
}

describe("LeadImportScreen", () => {
  it("says Reading enquiries-oct-2026.xlsx… while the worker reads the file", async () => {
    renderImport(anImport({ status: "reading" }));
    expect(await screen.findByText("Reading enquiries-oct-2026.xlsx…")).toBeVisible();
    expect(screen.getByText("Step 1 of 4 · Choose a file")).toBeVisible();
  });

  it("says why a file can't be read, with Choose another file", async () => {
    renderImport(anImport({ status: "unreadable", unreadableReason: "protected" }));
    expect(await screen.findByText("We can't read enquiries-oct-2026.xlsx")).toBeVisible();
    expect(screen.getByText(messages.imports.unreadable.protected)).toBeVisible();
    expect(screen.getByRole("link", { name: messages.imports.unreadable.chooseAnother })).toHaveAttribute(
      "href",
      routes.leadImport,
    );
  });

  it("shows the columns' step while the import waits for them", async () => {
    renderImport(anImport());
    expect(await screen.findByRole("heading", { level: 1, name: words.match.title })).toBeVisible();
  });

  it("goes back to the columns from the preview, and back to the preview", async () => {
    renderImport(aCheckedImport());
    expect(await screen.findByRole("heading", { level: 1, name: words.check.title })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.check.changeColumns }));
    expect(await screen.findByRole("heading", { level: 1, name: words.match.title })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.match.backToCheck }));
    expect(await screen.findByRole("heading", { level: 1, name: words.check.title })).toBeVisible();
  });

  it("says a cancelled or expired import is gone, with a way to import a file", async () => {
    renderImport(anImport({ status: "cancelled" }));
    expect(await screen.findByText(words.gone.cancelled)).toBeVisible();
    expect(screen.getByRole("link", { name: words.gone.again })).toHaveAttribute("href", routes.leadImport);
  });

  it("says when the import isn't there, with the refusal's sentence", async () => {
    stubApi({ "leadImports.get": { status: 404, reason: "NOT_FOUND" } });
    renderScreen(<LeadImportScreen importId={importId} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.reasons.NOT_FOUND);
  });

  it("moves the focus to each step's heading as the step changes (I3)", async () => {
    const api = stubApi({
      "leadImports.get": { data: anImport({ status: "reading" }) },
      "leads.owners": { data: workers },
    });
    renderScreen(<LeadImportScreen importId={importId} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    });
    api.answer("leadImports.get", { data: aCheckedImport() });
    await userEvent.click(document.body);
    // A new answer is a new step: the screen asks again every 2 seconds while the worker reads.
    await waitFor(
      () => {
        expect(screen.getByRole("heading", { level: 1, name: words.check.title })).toHaveFocus();
      },
      { timeout: 5000 },
    );
  });

  it("keeps the matches chosen when the columns are changed from the preview (I15)", async () => {
    renderImport(
      aCheckedImport({
        columns: columns.map((column) => (column.position === 4 ? { ...column, field: "note" as const } : column)),
        defaults: { stage: "contacted", ownerUserId: asha, budgetBasis: null, roleKey: null },
        valueMatches: [
          { field: "owner", value: "Vikas", target: ravi, matchedBy: "chosen" },
          { field: "owner", value: "Asha", target: asha, matchedBy: "first_name" },
        ],
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: words.check.changeColumns }));
    expect(await screen.findByRole("combobox", { name: "What Sr No holds" })).toHaveTextContent("Note");
    expect(screen.getByRole("combobox", { name: words.match.stageQuestion })).toHaveTextContent("Contacted");
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Where Vikas goes" })).toHaveTextContent("Ravi Kumar");
    });
  });

  it("says an expired import's file was deleted", async () => {
    renderImport(anImport({ status: "expired" }));
    expect(await screen.findByText(words.gone.expired)).toBeVisible();
  });
});
