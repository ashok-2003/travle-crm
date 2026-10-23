// The Facebook and Instagram lead ads group of Lead sources (spec 3.1): the connected Pages with how many forms each brings
// in, when it was last checked in the agency's zone and a badge, the name linking to the Page; Connect a Page, off at the
// limit, where Meta isn't set up, in the demo and while the subscription refuses changes, each with its reason as the
// button's description; the empty list, the loading rows, and a failed load that leaves the rest of the page alone.
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { MetaPagesGroup } from "@/lead-sources/meta/meta-pages-group";
import { metaConnectRoute, metaPageRoute } from "@/lib/routes";
import { renderScreen } from "../../leads/screen";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { stubApi } from "../../support/api-stub";
import { aMetaList, aPageItem, pageRowId } from "./records";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const words = messages.metaLeads.list;

function render(list: unknown) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T08:00:00Z"));
  stubApi({ "metaLeads.list": list === "error" ? { status: 500 } : { data: list } });
  return renderScreen(<MetaPagesGroup />, { width: "wide" });
}

describe("MetaPagesGroup", () => {
  it("lists the Pages with forms brought in, Last checked in the agency's zone and a badge, the name linking to the Page", async () => {
    render(
      aMetaList({
        items: [
          aPageItem(),
          aPageItem({
            id: "b",
            pageName: "Kerala Backwaters",
            badge: "needs_reconnect",
            formsBroughtIn: 1,
            lastCheckedAt: "2026-10-22T05:12:00.000Z",
          }),
          aPageItem({ id: "c", pageName: "New Page", badge: "paused", formsBroughtIn: 0, lastCheckedAt: null }),
        ],
      }),
    );
    const list = await screen.findByRole("list", { name: words.listLabel });
    const [first, second, third] = within(list).getAllByRole("listitem");
    if (first === undefined || second === undefined || third === undefined) throw new Error("items missing");
    // 05:12 UTC is 10:42 in India: today's time alone, another day's with its day.
    expect(within(first).getByRole("link", { name: "Rajasthan Holidays" })).toHaveAttribute(
      "href",
      metaPageRoute(pageRowId),
    );
    expect(first).toHaveTextContent("2 forms brought in · last checked 10:42 am");
    expect(first).toHaveTextContent(messages.metaLeads.badges.running);
    expect(second).toHaveTextContent("1 form brought in · last checked 22 Oct, 10:42 am");
    expect(second).toHaveTextContent(messages.metaLeads.badges.needs_reconnect);
    expect(third).toHaveTextContent("No forms brought in · not checked yet");
    expect(screen.getByText("3 of 5")).toBeVisible();
    expect(screen.getByRole("link", { name: words.connect })).toHaveAttribute("href", metaConnectRoute);
  });

  it("shows the same list on a phone", async () => {
    stubApi({ "metaLeads.list": { data: aMetaList() } });
    renderScreen(<MetaPagesGroup />, { width: "phone" });
    expect(await screen.findByRole("link", { name: "Rajasthan Holidays" })).toBeVisible();
  });

  it("says no Page is connected, and offers Connect a Page", async () => {
    render(aMetaList({ items: [] }));
    expect(await screen.findByText(words.empty)).toBeVisible();
    expect(screen.getByRole("link", { name: words.connect })).toBeVisible();
  });

  it("turns Connect a Page off at five Pages, where Meta isn't set up and in the demo, each with its reason", async () => {
    const { unmount } = render(aMetaList({ items: ["a", "b", "c", "d", "e"].map((id) => aPageItem({ id })) }));
    const full = await screen.findByRole("button", { name: words.connect });
    expect(full).toBeDisabled();
    expect(full).toHaveAccessibleDescription("You can connect up to 5 Pages. Disconnect one to connect another.");
    unmount();
    const off = render(aMetaList({ configured: false }));
    expect(await screen.findByRole("button", { name: words.connect })).toHaveAccessibleDescription(words.notSetUp);
    off.unmount();
    render(aMetaList({ demo: true }));
    expect(await screen.findByRole("button", { name: words.connect })).toHaveAccessibleDescription(words.demo);
  });

  it("turns Connect a Page off with the subscription's hint while the agency is read-only", async () => {
    stubApi({ "metaLeads.list": { data: aMetaList() } });
    screenIs("wide");
    renderWithApi(
      <MetaPagesGroup />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
    );
    const button = await screen.findByRole("button", { name: words.connect });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
  });

  it("says the Pages didn't load, with Try again, and keeps its heading", async () => {
    render("error");
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
    expect(screen.getByRole("heading", { name: words.heading })).toBeVisible();
  });

  it("shows the heading before the list arrives", () => {
    stubApi({ "metaLeads.list": "never" });
    renderScreen(<MetaPagesGroup />, { width: "wide" });
    expect(screen.getByRole("heading", { name: words.heading })).toBeVisible();
    expect(screen.queryByRole("link", { name: words.connect })).toBeNull();
  });
});
