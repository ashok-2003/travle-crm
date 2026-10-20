// What a sheet that has stopped says (S39-S44): lost access with the address, since when and Check again; a missing tab
// with a Select of the tabs there are now; missing columns by name; no manager with Take over; a read-only subscription;
// a pause with Resume. Google being busy says nothing.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { AttentionAlert } from "@/lead-sources/sheet/attention-alert";
import { sheetMatchRoute } from "@/lib/routes";
import { renderScreen, inputsTo } from "../../leads/screen";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { aColumnsView, aSheetDetail, address, sheetId } from "../records";

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.sheets.sheet.attention;

function renderAlert(detail = aSheetDetail(), answers: Parameters<typeof stubApi>[0] = {}) {
  const api = stubApi({ "leadSheets.get": { data: detail }, ...answers });
  renderScreen(<AttentionAlert detail={detail} />, { width: "wide" });
  return api;
}

describe("AttentionAlert", () => {
  it("shows the lost-access alert with the address, since when and Check again", async () => {
    const detail = aSheetDetail({
      status: "lost_access",
      attentionState: "lost_access",
      attentionSince: "2026-10-18T05:12:00.000Z",
      lastCheckedAt: "2026-10-18T05:12:00.000Z",
    });
    renderAlert(detail, { "leadSheets.recheck": { data: null } });
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(words.lost_access.title)).toBeVisible();
    expect(within(alert).getByText(/^It may have been unshared or deleted/)).toBeVisible();
    expect(within(alert).queryByText(/Last checked/)).toBeNull();
    expect(within(alert).getByText("Since 18 Oct.")).toBeVisible();
    expect(within(alert).getByRole("textbox", { name: messages.sheets.connect.share.addressLabel })).toHaveValue(
      address,
    );
    await userEvent.click(within(alert).getByRole("button", { name: words.lost_access.action }));
    await waitFor(() => {
      expect(inputsTo("leadSheets.recheck")).toEqual([{ sheetId }]);
    });
  });

  it("lists the tabs there are now for a missing tab, and sends the one chosen", async () => {
    const detail = aSheetDetail({ status: "tab_missing", attentionState: "tab_missing", tabTitle: "Old tab" });
    renderAlert(detail, {
      "leadSheets.verify": {
        data: aColumnsView({
          tabs: [
            { gid: "7", title: "Enquiries" },
            { gid: "8", title: "Archive" },
          ],
          tabGid: "",
          columns: [],
        }),
      },
      "leadSheets.recheck": { data: null },
    });
    expect(await screen.findByText(words.tab_missing.title)).toBeVisible();
    expect(screen.getByText(/‘Old tab’ isn't in the sheet any more/)).toBeVisible();
    const use = screen.getByRole("button", { name: words.tab_missing.action });
    expect(use).toBeDisabled();
    await userEvent.click(await screen.findByRole("combobox", { name: words.tab_missing.label }));
    await userEvent.click(await screen.findByRole("option", { name: "Archive" }));
    await userEvent.click(use);
    await waitFor(() => {
      expect(inputsTo("leadSheets.recheck")).toEqual([{ sheetId, tabGid: "8" }]);
    });
  });

  it("names the missing columns and leads to matching them again", async () => {
    renderAlert(
      aSheetDetail({
        status: "columns_missing",
        attentionState: "columns_missing",
        columns: { matched: 3, total: 4, newUnmatched: [], missing: ["Full name", "Phone number"] },
      }),
    );
    expect(await screen.findByText(/no longer has Full name and Phone number\./)).toBeVisible();
    expect(screen.getByRole("link", { name: words.columns_missing.action })).toHaveAttribute(
      "href",
      sheetMatchRoute(sheetId),
    );
  });

  it("shows Checking… on Check again while it is out", async () => {
    const held = heldAnswer({ data: null });
    renderAlert(aSheetDetail({ status: "lost_access", attentionState: "lost_access" }), {
      "leadSheets.recheck": held.answer,
    });
    await userEvent.click(await screen.findByRole("button", { name: words.lost_access.action }));
    expect(await screen.findByRole("button", { name: messages.sheets.sheet.checking })).toBeDisabled();
    held.release();
  });

  it("tries the tabs again when asking Google for them failed", async () => {
    const api = renderAlert(aSheetDetail({ status: "tab_missing", attentionState: "tab_missing" }), {
      "leadSheets.verify": { status: 502 },
    });
    const again = await screen.findByRole("button", { name: messages.common.tryAgain });
    api.answer("leadSheets.verify", { data: aColumnsView({ tabs: [{ gid: "7", title: "Enquiries" }], columns: [] }) });
    await userEvent.click(again);
    await userEvent.click(await screen.findByRole("combobox", { name: words.tab_missing.label }));
    expect(await screen.findByRole("option", { name: "Enquiries" })).toBeVisible();
    expect(inputsTo("leadSheets.verify")).toHaveLength(2);
  });

  it("offers Take over for a sheet that needs a manager", async () => {
    renderAlert(aSheetDetail({ status: "needs_manager", attentionState: "needs_manager" }), {
      "leadSheets.takeOver": { data: null },
    });
    await userEvent.click(await screen.findByRole("button", { name: words.needs_manager.action }));
    await waitFor(() => {
      expect(inputsTo("leadSheets.takeOver")).toEqual([{ sheetId }]);
    });
  });

  it("says a paused sheet waits, with Resume", async () => {
    renderAlert(aSheetDetail({ status: "paused" }), { "leadSheets.resume": { data: null } });
    expect(await screen.findByText(words.paused.title)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.paused.action }));
    await waitFor(() => {
      expect(inputsTo("leadSheets.resume")).toEqual([{ sheetId }]);
    });
  });

  it("says rows wait while the subscription is read-only, with no button", async () => {
    renderAlert(aSheetDetail({ readOnly: true }));
    expect(await screen.findByText(words.readOnly.title)).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tells nothing for a running sheet, even when Google was busy", () => {
    renderAlert(aSheetDetail({ late: true }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
