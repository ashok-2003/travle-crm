// Step 4 while the worker adds (spec 3.2): the bar with the rows done, the way out ("we'll tell you when it's done"),
// and Stop, which asks first and says it is stopping once asked.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { AddingStep } from "@/leads/import/adding-step";
import { stubApi } from "../../support/api-stub";
import { inputsTo, renderScreen } from "../screen";
import { aCheckedImport, counts, importId } from "./records";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const words = messages.leads.import.adding;
const addingImport = (rowsDone: number, addRequestedAt: string) =>
  aCheckedImport({
    status: "adding",
    counts: {
      ...counts,
      byPlan: { new: 1053, returning: 41, enquiry: 63, blocked: 0, already_imported: 0, in_crm: 0, not_added: 129 },
    },
    progress: { rowsTotal: 1286, rowsToAdd: 1157, rowsDone, rowsAdded: rowsDone, addRequestedAt },
  });

describe("AddingStep", () => {
  it("shows 642 of 1,157 rows and About a minute left, and says you can leave", () => {
    vi.useFakeTimers({ now: new Date("2026-10-19T10:41:00.000Z"), toFake: ["Date"] });
    stubApi({});
    renderScreen(<AddingStep detail={addingImport(642, "2026-10-19T10:40:00.000Z")} />);
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByText("From enquiries-oct-2026.xlsx, as Asha Sharma.")).toBeVisible();
    expect(screen.getByText("642 of 1,157 rows")).toBeVisible();
    expect(screen.getByText(messages.imports.progress.aboutAMinute)).toBeVisible();
    expect(screen.getByText(words.leave)).toBeVisible();
  });

  it("stops after asking: 'The rows already added stay.'", async () => {
    stubApi({ "leadImports.stop": { data: null } });
    renderScreen(<AddingStep detail={addingImport(100, "2026-10-19T10:40:00.000Z")} />);
    await userEvent.click(screen.getByRole("button", { name: words.stop }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(words.stopTitle)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: words.stopAction }));
    await waitFor(() => {
      expect(inputsTo("leadImports.stop")).toEqual([{ importId }]);
    });
    expect(await screen.findByText(words.stopping)).toBeVisible();
    expect(screen.getByRole("button", { name: words.stop })).toBeDisabled();
  });

  it("counts what the importer's choices will add, not the rows left out (I1)", () => {
    stubApi({});
    // 53 blocked rows and 13 already imported are left out: the preview said Add 1,157, and so does the bar.
    renderScreen(
      <AddingStep
        detail={aCheckedImport({
          status: "adding",
          counts: {
            ...counts,
            byPlan: {
              new: 1053,
              returning: 41,
              enquiry: 63,
              blocked: 53,
              already_imported: 13,
              in_crm: 0,
              not_added: 129,
            },
          },
          progress: {
            rowsTotal: 1352,
            rowsToAdd: 1157,
            rowsDone: 400,
            rowsAdded: 150,
            addRequestedAt: "2026-10-19T10:40:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByText("150 of 1,157 rows")).toBeVisible();
  });
});
