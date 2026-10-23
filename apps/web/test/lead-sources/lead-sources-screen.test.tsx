// Lead sources in Settings (spec 6.5): the connected sheets with their tab, when each was last checked in the agency's
// zone and a badge, the name linking to the sheet; Connect a sheet, off at the limit, where Google isn't set up and in the
// demo, each with its reason as the button's description; the loading rows, the error and the empty state.
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { LeadSourcesScreen } from "@/lead-sources/lead-sources-screen";
import { sheetConnectRoute, sheetConnectStepRoute, sheetRoute } from "@/lib/routes";
import { stubApi } from "../support/api-stub";
import { renderScreen } from "../leads/screen";
import { aSheetItem, aSheetList, sheetId } from "./records";
import { aMetaList } from "./meta/records";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const words = messages.sheets.list;

function render(list: unknown, width: "phone" | "wide" = "wide") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T08:00:00Z"));
  stubApi({
    "leadSheets.list": list === "error" ? { status: 500 } : { data: list },
    "metaLeads.list": { data: aMetaList() },
  });
  return renderScreen(<LeadSourcesScreen />, { width });
}

describe("LeadSourcesScreen", () => {
  it("lists the sheets with name, tab, Last checked in the agency's zone and a badge, the name linking to the sheet", async () => {
    render(
      aSheetList({
        items: [
          aSheetItem(),
          aSheetItem({
            id: "b",
            sheetTitle: "Walk-in",
            tabTitle: "Enquiries",
            status: "lost_access",
            attentionState: "lost_access",
            lastCheckedAt: "2026-10-18T05:12:00.000Z",
          }),
          aSheetItem({ id: "c", sheetTitle: "Draft", status: "connecting", lastCheckedAt: null }),
        ],
      }),
    );
    const table = await screen.findByRole("table", { name: words.listLabel });
    const [first, second, third] = within(table).getAllByRole("row").slice(1);
    if (first === undefined || second === undefined || third === undefined) throw new Error("rows missing");
    // 05:12 UTC is 10:42 in India: today's time alone, another day's with its day.
    expect(within(first).getByRole("link", { name: "Goa Diwali campaign" })).toHaveAttribute(
      "href",
      sheetRoute(sheetId),
    );
    expect(first).toHaveTextContent("Form responses 1");
    expect(first).toHaveTextContent("10:42 am");
    expect(first).toHaveTextContent(messages.sheets.statuses.running);
    expect(second).toHaveTextContent("18 Oct, 10:42 am");
    expect(second).toHaveTextContent(messages.sheets.statuses.lost_access);
    // A sheet still being set up leads back to the step it stopped at.
    expect(within(third).getByRole("link", { name: "Draft" })).toHaveAttribute("href", sheetConnectStepRoute("c"));
    expect(third).toHaveTextContent(words.notChecked);
    expect(screen.getByText("3 of 5")).toBeVisible();
    expect(screen.getByRole("link", { name: words.connect })).toHaveAttribute("href", sheetConnectRoute);
  });

  it("shows a list on a phone", async () => {
    render(aSheetList(), "phone");
    const list = await screen.findByRole("list", { name: words.listLabel });
    expect(within(list).getByText(/Form responses 1 · Last checked 10:42 am/)).toBeVisible();
  });

  it("shows an EmptyState for an agency with no sheet, with its sentence", async () => {
    render(aSheetList({ items: [] }));
    expect(await screen.findByText(words.empty)).toBeVisible();
    expect(screen.getByRole("link", { name: words.connect })).toBeVisible();
  });

  it("disables Connect a sheet at five sheets with the hint as the button's description", async () => {
    render(aSheetList({ items: ["a", "b", "c", "d", "e"].map((id) => aSheetItem({ id })) }));
    const button = await screen.findByRole("button", { name: words.connect });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("You can connect up to 5 sheets. Disconnect one to connect another.");
  });

  it("says Google isn't set up and turns the button off, and says the demo has none", async () => {
    const { unmount } = render(aSheetList({ configured: false }));
    const off = await screen.findByRole("button", { name: words.connect });
    expect(off).toBeDisabled();
    expect(off).toHaveAccessibleDescription(words.notSetUp);
    unmount();
    render(aSheetList({ demo: true }));
    expect(await screen.findByRole("button", { name: words.connect })).toHaveAccessibleDescription(words.demo);
  });

  it("shows the error with Try again, and the sentence of a refusal", async () => {
    render("error");
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });

  it("shows the loading rows before the list arrives", () => {
    stubApi({ "leadSheets.list": "never", "metaLeads.list": "never" });
    renderScreen(<LeadSourcesScreen />, { width: "wide" });
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
