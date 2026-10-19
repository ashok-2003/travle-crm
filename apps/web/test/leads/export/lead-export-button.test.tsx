// The Leads header's Export (spec 3.1, 3.3): shown to everyone who sees the list, working while the agency is
// read-only, saying what the file holds as the list shows it, and asking for Excel or CSV with the list's filter, the
// search included, then downloading it.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadExportDetail } from "@travel-crm/contracts/crm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { forgetTabValues, keepTabValue } from "@/lib/tab-storage";
import { LeadExportButton } from "@/leads/export/lead-export-button";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { stubApi } from "../../support/api-stub";
import { member } from "../../support/members";
import { address } from "../navigation";
import { inputsTo, renderScreen, salesperson } from "../screen";

vi.mock("next/navigation", () => import("../navigation"));
vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

const words = messages.exports;
const exportId = "0199e7a0-0000-7000-8000-0000000000e1";
const goaId = "0199e7a0-0000-7000-8000-0000000000d1";
const link = { url: "https://files.example/leads.csv", expiresAt: "2099-10-20T05:05:00.000Z" };
const ready: LeadExportDetail = {
  id: exportId,
  kind: "leads",
  format: "csv",
  status: "ready",
  failureReason: null,
  rowsTotal: 312,
  rowsDone: 312,
  file: { fileName: "leads-2026-10-20-1030.csv", sizeBytes: 2_048 },
  createdAt: "2026-10-20T05:00:00.000Z",
  readyAt: "2026-10-20T05:01:00.000Z",
  expiresAt: "2026-10-21T05:01:00.000Z",
  filter: { view: "everyone", stage: "open" },
  people: {},
  destinationName: null,
};

function apiWith(answers: Record<string, Parameters<typeof stubApi>[0][string]> = {}) {
  return stubApi({
    // The api names any destination by id, not only the first hundred the picker lists.
    "leadExports.names": { data: { people: {}, destinationName: "Goa" } },
    "leadExports.start": { data: { exportId } },
    "leadExports.get": { data: ready },
    "leadExports.downloadLink": { data: link },
    ...answers,
  });
}

beforeEach(() => {
  screenIs("wide");
  address.set("/leads");
  forgetTabValues();
  vi.mocked(loadPage).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LeadExportButton", () => {
  it("shows Export to everyone who sees the list, working while the agency is read-only", async () => {
    apiWith();
    renderWithApi(
      <LeadExportButton />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
      salesperson,
    );
    const button = screen.getByRole("button", { name: messages.leads.export.button });
    expect(button).toBeEnabled();
    expect(button.dataset.variant).toBe("outline");
    await userEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: messages.leads.export.dialog.title });
    expect(within(dialog).getByRole("button", { name: words.dialog.prepare })).toBeEnabled();
  });

  it("leaves Export out for a role that can't see leads", () => {
    apiWith();
    renderScreen(<LeadExportButton />, { me: member({ permissions: ["tasks:view"] }) });
    expect(screen.queryByRole("button", { name: messages.leads.export.button })).toBeNull();
  });

  it("says what the file holds: 'Everyone · Open · Goa · matching \"Sharma\"', and 'Mine · Contacted' for a salesperson", async () => {
    apiWith();
    address.set(`/leads?view=everyone&destination=${goaId}`);
    keepTabValue("leads.search", "Sharma");
    const { unmount } = renderScreen(<LeadExportButton />);
    await userEvent.click(screen.getByRole("button", { name: messages.leads.export.button }));
    expect(await screen.findByText('Everyone · Open · Goa · matching "Sharma"')).toBeVisible();
    expect(inputsTo("leadExports.names")).toContainEqual({ destinationId: goaId });
    unmount();

    forgetTabValues();
    address.set("/leads?stage=contacted&view=everyone");
    renderScreen(<LeadExportButton />, { me: salesperson });
    await userEvent.click(screen.getByRole("button", { name: messages.leads.export.button }));
    // A salesperson's list is their own, whatever the address says.
    expect(await screen.findByText("Mine · Contacted")).toBeVisible();
  });

  it("prepares Excel by default, or CSV, and downloads it", async () => {
    apiWith();
    address.set(`/leads?view=everyone&stage=contacted&destination=${goaId}`);
    keepTabValue("leads.search", "Sharma");
    renderScreen(<LeadExportButton />);
    await userEvent.click(screen.getByRole("button", { name: messages.leads.export.button }));
    const dialog = await screen.findByRole("dialog", { name: messages.leads.export.dialog.title });
    expect(within(dialog).getByRole("radio", { name: words.formats.xlsx })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("radio", { name: words.formats.csv }));
    await userEvent.click(within(dialog).getByRole("button", { name: words.dialog.prepare }));
    await waitFor(() => {
      expect(inputsTo("leadExports.start")).toEqual([
        {
          filter: { view: "everyone", stage: "contacted", destinationId: goaId, search: "Sharma" },
          format: "csv",
        },
      ]);
    });
    expect(await within(dialog).findByText("leads-2026-10-20-1030.csv")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: words.dialog.download }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
    expect(inputsTo("leadExports.downloadLink")).toEqual([{ exportId }]);
  });
});
