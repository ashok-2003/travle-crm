// An export's page (spec 3.3, B42, B54), where the bell's "Your leads export is ready" leads: its title, what it holds,
// its state and Download until the file is deleted 24 hours after it was ready; then it says so, with a way back.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExportDetail } from "@travel-crm/contracts/exports";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportScreen } from "@/exports/export-screen";
import type { ExportCalls } from "@/exports/use-export";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { renderAs, screenIs } from "../organization/render";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const words = messages.exports;
const exportId = "0199e7a0-0000-7000-8000-0000000000e2";
const link = { url: "https://files.example/leads.csv", expiresAt: "2099-10-20T05:05:00.000Z" };
const ready: ExportDetail = {
  id: exportId,
  kind: "leads",
  format: "csv",
  status: "ready",
  failureReason: null,
  rowsTotal: 312,
  rowsDone: 312,
  file: { fileName: "leads-20-oct-2026.csv", sizeBytes: 2_048 },
  createdAt: "2026-10-20T05:00:00.000Z",
  readyAt: "2026-10-20T05:01:00.000Z",
  expiresAt: "2026-10-21T05:01:00.000Z",
};

function callsOf(detail: ExportDetail): ExportCalls {
  return {
    start: () => Promise.resolve({ exportId }),
    detailOptions: (id: string) => ({ queryKey: ["export", id], queryFn: () => Promise.resolve(detail) }),
    downloadLink: vi.fn<ExportCalls["downloadLink"]>(() => Promise.resolve(link)),
  };
}

const page = (calls: ExportCalls) => (
  <ExportScreen
    title="Leads export"
    holds="Everyone · Open · Goa"
    calls={calls}
    exportId={exportId}
    back={{ href: "/leads", label: "Leads" }}
  />
);

beforeEach(() => {
  screenIs("wide");
  vi.mocked(loadPage).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExportScreen", () => {
  it("shows an export's page with Download until it's deleted, then says so", async () => {
    const calls = callsOf(ready);
    const { unmount } = renderAs(page(calls));
    expect(screen.getByRole("heading", { level: 1, name: "Leads export" })).toBeVisible();
    expect(await screen.findByText("Everyone · Open · Goa")).toBeVisible();
    expect(screen.getByText(words.statuses.ready)).toBeVisible();
    expect(screen.getByText(words.formats.csv)).toBeVisible();
    expect(screen.getByText("leads-20-oct-2026.csv")).toBeVisible();
    expect(screen.getByText("2 KB")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.dialog.download }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
    expect(calls.downloadLink).toHaveBeenCalledWith(exportId);
    unmount();

    renderAs(page(callsOf({ ...ready, status: "expired", file: null })));
    expect(await screen.findByText(words.page.deleted)).toBeVisible();
    expect(words.page.deleted).toBe("This file was deleted after 24 hours.");
    expect(screen.getByText(words.statuses.expired)).toBeVisible();
    expect(screen.queryByRole("button", { name: words.dialog.download })).toBeNull();
    expect(screen.getByRole("link", { name: "Leads" })).toHaveAttribute("href", "/leads");
  });

  it("says why an export failed", async () => {
    renderAs(page(callsOf({ ...ready, status: "failed", failureReason: "lost_permission", file: null })));
    expect(await screen.findByText(words.failures.lost_permission)).toBeVisible();
    expect(screen.queryByRole("button", { name: words.dialog.download })).toBeNull();
  });
});
