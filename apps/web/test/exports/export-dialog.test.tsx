// The export dialog (spec 3.3, 3.5, B39, B41, B42): what the file will hold, Excel or CSV (Excel chosen), the sentence
// on phones and the 24 hours, Prepare the file held while it is asked for, then the job's progress, which the dialog
// may be closed during, and the file's name and size with Download: an export, so a read-only agency may take it.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExportDetail } from "@travel-crm/contracts/exports";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "@/exports/export-dialog";
import type { ExportCalls } from "@/exports/use-export";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const words = messages.exports;
const exportId = "0199e7a0-0000-7000-8000-0000000000e1";
const link = { url: "https://files.example/leads.xlsx", expiresAt: "2099-10-20T05:05:00.000Z" };

function anExport(changes: Partial<ExportDetail> = {}): ExportDetail {
  return {
    id: exportId,
    kind: "leads",
    format: "xlsx",
    status: "making",
    failureReason: null,
    rowsTotal: 312,
    rowsDone: 100,
    file: null,
    createdAt: "2026-10-20T05:00:00.000Z",
    readyAt: null,
    expiresAt: null,
    ...changes,
  };
}

/** The kind's calls: the export's detail is whatever `shown` holds when it is asked for. */
function callsOf(shown: { detail: ExportDetail }, start?: ExportCalls["start"]) {
  return {
    start: vi.fn<ExportCalls["start"]>(start ?? (() => Promise.resolve({ exportId }))),
    detailOptions: (id: string) => ({ queryKey: ["export", id], queryFn: () => Promise.resolve(shown.detail) }),
    downloadLink: vi.fn<ExportCalls["downloadLink"]>(() => Promise.resolve(link)),
  };
}

function dialog(calls: ExportCalls) {
  return (
    <ExportDialog
      open
      onOpenChange={() => undefined}
      title="Export leads"
      intro="Download the leads this list shows."
      holds="Everyone · Open · Goa"
      rowsWord="leads"
      calls={calls}
    />
  );
}

beforeEach(() => {
  screenIs("wide");
  vi.mocked(loadPage).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExportDialog", () => {
  it("offers Excel (chosen) or CSV, says the file holds phones and is deleted after 24 hours, and holds while preparing", async () => {
    let asked: (started: { exportId: string }) => void = () => undefined;
    const calls = callsOf(
      { detail: anExport() },
      () =>
        new Promise((resolve) => {
          asked = resolve;
        }),
    );
    renderWithApi(dialog(calls), newQueryClient());
    expect(screen.getByRole("dialog", { name: "Export leads" })).toBeVisible();
    expect(screen.getByText("Everyone · Open · Goa")).toBeVisible();
    const excel = screen.getByRole("radio", { name: words.formats.xlsx });
    expect(excel).toBeChecked();
    expect(excel).toHaveAccessibleDescription(words.formats.xlsxHint);
    expect(screen.getByRole("radio", { name: words.formats.csv })).toHaveAccessibleDescription(words.formats.csvHint);
    expect(screen.getByText(words.dialog.privacy)).toBeVisible();
    expect(words.dialog.privacy).toBe(
      "The file holds customers' phone numbers and emails. Your export is recorded in the audit log, and the file is deleted after 24 hours.",
    );

    await userEvent.click(screen.getByRole("radio", { name: words.formats.csv }));
    await userEvent.click(screen.getByRole("button", { name: words.dialog.prepare }));
    expect(calls.start).toHaveBeenCalledWith("csv");
    // Asked for: nothing closes the dialog until the api answers.
    expect(screen.getByRole("button", { name: words.dialog.prepare })).toBeDisabled();
    expect(screen.getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    act(() => {
      asked({ exportId });
    });
    expect(await screen.findByText("Preparing 312 leads…")).toBeVisible();
  });

  it("shows Preparing 312 leads… then the file's name and size with Download, also while the agency is read-only", async () => {
    const shown = { detail: anExport() };
    const calls = callsOf(shown);
    const queryClient = newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" });
    renderWithApi(dialog(calls), queryClient, member({ isOwner: true }));
    await userEvent.click(screen.getByRole("button", { name: words.dialog.prepare }));
    expect(calls.start).toHaveBeenCalledWith("xlsx");
    expect(await screen.findByText("Preparing 312 leads…")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Preparing 312 leads…" })).toBeVisible();
    expect(screen.getByText(words.dialog.closeHint)).toBeVisible();
    // Closing it now is allowed (its own Close and the corner's): the job goes on, and the bell says when it's ready.
    const closes = screen.getAllByRole("button", { name: messages.common.close });
    expect(closes).toHaveLength(2);
    for (const close of closes) expect(close).toBeEnabled();

    shown.detail = anExport({
      status: "ready",
      rowsDone: 312,
      file: { fileName: "leads-20-oct-2026.xlsx", sizeBytes: 48_213 },
      readyAt: "2026-10-20T05:01:00.000Z",
      expiresAt: "2026-10-21T05:01:00.000Z",
    });
    await act(() => queryClient.invalidateQueries({ queryKey: ["export", exportId] }));
    expect(await screen.findByText("leads-20-oct-2026.xlsx")).toBeVisible();
    expect(screen.getByText("47 KB")).toBeVisible();
    // What it holds, the file and its size are one list, spaced alike (W11).
    expect(
      within(screen.getByRole("list"))
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["What it holdsEveryone · Open · Goa", "Fileleads-20-oct-2026.xlsx", "Size47 KB"]);
    const download = screen.getByRole("button", { name: words.dialog.download });
    expect(download).toBeEnabled();
    expect(screen.queryByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeNull();
    await userEvent.click(download);
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
    expect(calls.downloadLink).toHaveBeenCalledWith(exportId);
  });

  it("says why an export failed, and offers to prepare it again", async () => {
    const shown = { detail: anExport({ status: "failed", failureReason: "too_many_rows", rowsDone: 0 }) };
    renderWithApi(dialog(callsOf(shown)), newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: words.dialog.prepare }));
    expect(await screen.findByText("This export has more than 1,00,000 leads. Narrow it with a filter.")).toBeVisible();
    expect(screen.getByRole("button", { name: words.dialog.prepare })).toBeEnabled();
  });

  it("is off with its hint while the agency can't export", () => {
    renderWithApi(
      dialog(callsOf({ detail: anExport() })),
      newQueryClient({ ...paidSubscription, status: "cancelled", access: "locked" }),
    );
    expect(screen.getByRole("button", { name: words.dialog.prepare })).toBeDisabled();
    expect(screen.getByText(messages.errors.reasons.ORGANIZATION_CANCELLED)).toBeVisible();
  });
});
