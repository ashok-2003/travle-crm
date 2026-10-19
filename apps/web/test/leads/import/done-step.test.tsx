// Step 4 when the add has ended (spec 3.2): Done with the counts, the report of the rows not added to download (an
// export, so a read-only agency may), when it is kept until, and the way to the imported leads; a stopped or failed
// import says what it added and why it did not finish.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { DoneStep } from "@/leads/import/done-step";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { stubApi } from "../../support/api-stub";
import { member } from "../../support/members";
import { inputsTo, renderScreen } from "../screen";
import { aCheckedImport, counts, importId } from "./records";

const loadPage = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock("@/lib/navigate", () => ({ loadPage }));

afterEach(() => {
  vi.unstubAllGlobals();
  loadPage.mockReset();
});

const words = messages.leads.import.done;
const finished = (overrides: Parameters<typeof aCheckedImport>[0] = {}) =>
  aCheckedImport({
    status: "done",
    finishedAt: "2026-10-19T10:46:00.000Z",
    counts: { ...counts, outcomes: { added: 1094, merged: 63, left_out: 25, not_added: 104 } },
    report: { fileName: "enquiries-oct-2026 - rows not added.xlsx", sizeBytes: 21_000 },
    ...overrides,
  });

describe("DoneStep", () => {
  it("shows Done with the counts, Download the 129 rows not added, Kept until 26 Oct, and See the imported leads", async () => {
    stubApi({
      "leadImports.reportLink": {
        data: { url: "https://files.example/report.xlsx", expiresAt: "2099-01-01T00:00:00.000Z" },
      },
    });
    renderScreen(<DoneStep detail={finished()} />);
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByText("enquiries-oct-2026.xlsx · 19 Oct, 4:16 pm")).toBeVisible();
    expect(screen.getByText(messages.imports.statuses.done)).toBeVisible();
    for (const [label, count] of [
      [words.newLeads, "1,094"],
      [words.repeatEnquiries, "63"],
      [words.notAdded, "129"],
    ]) {
      expect(screen.getByText(label ?? "").closest("[role=listitem]")).toHaveTextContent(count ?? "");
    }
    expect(screen.getByText("129 rows weren't added")).toBeVisible();
    expect(screen.getByText(/kept until 26 Oct/)).toBeVisible();
    expect(screen.getByRole("link", { name: words.see })).toHaveAttribute(
      "href",
      "/leads?view=everyone&source=bulk_upload",
    );
    await userEvent.click(screen.getByRole("button", { name: "Download the 129 rows not added" }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("https://files.example/report.xlsx");
    });
    expect(inputsTo("leadImports.reportLink")).toEqual([{ importId }]);
  });

  it("shows a stopped or failed import's counts, the download and the reason", () => {
    stubApi({});
    renderScreen(<DoneStep detail={finished({ status: "failed", failureReason: "lost_permission" })} />);
    expect(screen.getByRole("heading", { level: 1, name: words.titleFailed })).toBeVisible();
    expect(
      screen.getByText("This import stopped: you can no longer import. The rows added before it stay."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Download the 129 rows not added" })).toBeVisible();
  });

  it("offers no report when every row was added", () => {
    stubApi({});
    renderScreen(
      <DoneStep
        detail={finished({
          report: null,
          counts: { ...counts, outcomes: { added: 40, merged: 0, left_out: 0, not_added: 0 } },
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });

  it("lets a read-only agency download the report, an export", () => {
    stubApi({});
    renderWithApi(
      <DoneStep detail={finished()} />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
      member({ isOwner: true }),
    );
    expect(screen.getByRole("button", { name: "Download the 129 rows not added" })).toBeEnabled();
  });

  it("says in a status line, for a screen reader, how the add ended (I2)", () => {
    stubApi({});
    renderScreen(<DoneStep detail={finished()} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Import done. 1,094 new leads, 63 repeat enquiries, 129 rows not added.",
    );
  });

  it("shows a stopped import's counts, the reason and the download", () => {
    stubApi({});
    renderScreen(<DoneStep detail={finished({ status: "stopped" })} />);
    expect(screen.getByRole("heading", { level: 1, name: words.titleStopped })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Import stopped.");
    expect(screen.getByRole("button", { name: "Download the 129 rows not added" })).toBeVisible();
  });
});
