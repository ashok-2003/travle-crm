// The staff export (spec 3.5, B52): the dialog on Staff says what the file holds, "18 people, with their roles and
// joined dates", prepares it, and downloads it; and its page says the same, with the way back to Staff.
import type { ExportDetail } from "@travel-crm/contracts/exports";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffExportButton } from "@/organization/staff/export/staff-export-button";
import { StaffExportScreen } from "@/organization/staff/export/staff-export-screen";
import { loadPage } from "@/lib/navigate";
import { newQueryClient, renderWithApi } from "../api";
import { screenIs } from "../render";
import { stubApi } from "../../support/api-stub";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const exportId = "0199e7a0-0000-7000-8000-0000000000e1";
const ready: ExportDetail = {
  id: exportId,
  kind: "staff",
  format: "xlsx",
  status: "ready",
  failureReason: null,
  rowsTotal: 18,
  rowsDone: 18,
  file: { fileName: "staff-2026-10-19.xlsx", sizeBytes: 9216 },
  createdAt: "2026-10-19T11:00:00.000Z",
  readyAt: "2026-10-19T11:00:05.000Z",
  expiresAt: "2026-10-20T11:00:05.000Z",
};
const link = { url: "https://files.example/staff-2026-10-19.xlsx", expiresAt: "2099-10-20T05:05:00.000Z" };

describe("the staff export", () => {
  beforeEach(() => {
    screenIs("wide");
    vi.mocked(loadPage).mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exports '18 people, with their roles and joined dates' and downloads the file", async () => {
    const api = stubApi({
      "staffExports.start": { data: { exportId } },
      "staffExports.get": { data: ready },
      "staffExports.downloadLink": { data: link },
    });
    renderWithApi(<StaffExportButton count={18} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByRole("dialog", { name: "Export staff" })).toBeVisible();
    expect(screen.getByText("18 people, with their roles and joined dates.")).toBeVisible();
    expect(screen.getByText("Your staff")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Prepare the file" }));
    expect(await screen.findByText("staff-2026-10-19.xlsx")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
    expect(api.calls).toEqual(
      expect.arrayContaining(["staffExports.start", "staffExports.get", "staffExports.downloadLink"]),
    );
  });

  it("opens an export's page with its file, Download, and the way back to Staff", async () => {
    stubApi({ "staffExports.get": { data: ready }, "staffExports.downloadLink": { data: link } });
    renderWithApi(<StaffExportScreen exportId={exportId} />, newQueryClient());
    expect(await screen.findByRole("heading", { name: "Staff export" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Staff" })).toHaveAttribute("href", "/staff");
    expect(await screen.findByText("staff-2026-10-19.xlsx")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
  });
});
