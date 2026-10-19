// A lead export's page (spec 3.3, B42): where the bell's "Your leads export is ready" leads, saying what the file holds
// from the filter it was asked with (the owner and the destination named, the search emptied once it was made), with
// Download until the file is deleted, then saying so.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadExportDetail } from "@travel-crm/contracts/crm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { LeadExportScreen } from "@/leads/export/lead-export-screen";
import { routes } from "@/lib/routes";
import { stubApi } from "../../support/api-stub";
import { inputsTo, owner, renderScreen } from "../screen";

vi.mock("next/navigation", () => import("../navigation"));
vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const words = messages.exports;
const exportId = "0199e7a0-0000-7000-8000-0000000000e2";
const link = { url: "https://files.example/leads.xlsx", expiresAt: "2099-10-20T05:05:00.000Z" };
const ready: LeadExportDetail = {
  id: exportId,
  kind: "leads",
  format: "xlsx",
  status: "ready",
  failureReason: null,
  rowsTotal: 312,
  rowsDone: 312,
  file: { fileName: "leads-2026-10-20-1030.xlsx", sizeBytes: 48_213 },
  createdAt: "2026-10-20T05:00:00.000Z",
  readyAt: "2026-10-20T05:01:00.000Z",
  expiresAt: "2026-10-21T05:01:00.000Z",
  filter: { view: "everyone", stage: "contacted", ownerUserId: owner.user.id, destinationId: "d1" },
  people: { [owner.user.id]: "Asha Sharma" },
  destinationName: "Goa",
};

beforeEach(() => {
  vi.mocked(loadPage).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeadExportScreen", () => {
  it("opens the export's page from the bell, with Download until it's deleted", async () => {
    const api = stubApi({ "leadExports.get": { data: ready }, "leadExports.downloadLink": { data: link } });
    const { unmount } = renderScreen(<LeadExportScreen exportId={exportId} />);
    expect(screen.getByRole("heading", { level: 1, name: messages.leads.export.title })).toBeVisible();
    expect(screen.getByRole("link", { name: messages.leads.export.back })).toHaveAttribute("href", routes.leads);
    expect(await screen.findByText("Everyone · Contacted · Asha Sharma · Goa")).toBeVisible();
    expect(screen.getByText("leads-2026-10-20-1030.xlsx")).toBeVisible();
    expect(inputsTo("leadExports.get")[0]).toEqual({ exportId });
    await userEvent.click(screen.getByRole("button", { name: words.dialog.download }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
    unmount();

    api.answer("leadExports.get", { data: { ...ready, status: "expired", file: null } });
    renderScreen(<LeadExportScreen exportId={exportId} />);
    expect(await screen.findByText(words.page.deleted)).toBeVisible();
    expect(screen.queryByRole("button", { name: words.dialog.download })).toBeNull();
  });

  it("says why an export failed", async () => {
    stubApi({
      "leadExports.get": {
        data: { ...ready, status: "failed", failureReason: "too_many_rows", file: null, rowsDone: 0 },
      },
    });
    renderScreen(<LeadExportScreen exportId={exportId} />);
    expect(await screen.findByText(words.failures.too_many_rows.leads)).toBeVisible();
  });
});
