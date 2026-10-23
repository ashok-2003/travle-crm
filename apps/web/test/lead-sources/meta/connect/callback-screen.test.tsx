// Connecting a Page, step 2 (spec 3.2, 7): where Facebook's dialog sends the browser back. The code and state are read from the
// address once and cleared from it, posted once, and the Pages the person shared are shown with what can be done with each;
// the ticked ones are connected and the person goes to their page. A cancelled dialog and a refused login say so; a reconnect
// finishes inside the one call.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { MetaCallbackScreen } from "@/lead-sources/meta/connect/meta-callback-screen";
import { metaConnectRoute, metaPageRoute, routes } from "@/lib/routes";
import { renderScreen, inputsTo } from "../../../leads/screen";
import { routerCalls } from "../../../leads/navigation";
import { stubApi } from "../../../support/api-stub";
import { aSharedList, pageRowId } from "../records";

vi.mock("next/navigation", () => import("../../../leads/navigation"));

const callback = "/settings/lead-sources/meta/callback";

/** The address Facebook sends the browser back to. */
function comeBackTo(search: string) {
  window.history.replaceState(null, "", `${callback}${search}`);
}

beforeEach(() => {
  comeBackTo("?code=AQDcode&state=signed.state");
});

afterEach(() => {
  vi.unstubAllGlobals();
  routerCalls.push.mockClear();
  routerCalls.replace.mockClear();
});

const words = messages.metaLeads.callback;

describe("MetaCallbackScreen", () => {
  it("posts the code and state once, clears them from the address, and lists the Pages with what can be done with each", async () => {
    stubApi({ "metaLeads.connectFinish": { data: aSharedList() } });
    renderScreen(<MetaCallbackScreen />);
    expect(await screen.findByRole("heading", { level: 1, name: words.title })).toBeVisible();
    await screen.findByRole("list", { name: words.listLabel });
    expect(inputsTo("metaLeads.connectFinish")).toEqual([{ code: "AQDcode", state: "signed.state" }]);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe(callback);
    // Only the Page that can be connected is ticked, and the others say why they are off.
    expect(screen.getByRole("checkbox", { name: "Rajasthan Holidays" })).toBeChecked();
    for (const [name, why] of [
      ["Kerala Backwaters", words.connected_here],
      ["Goa Beach Escapes", words.connected_elsewhere],
      ["Someone Else's Page", words.not_allowed],
    ] as const) {
      const box = screen.getByRole("checkbox", { name });
      expect(box).toBeDisabled();
      expect(box).not.toBeChecked();
      expect(box).toHaveAccessibleDescription(why);
    }
    expect(screen.getByRole("button", { name: "Connect 1 Page" })).toBeEnabled();
  });

  it("connects the ticked Pages and goes to the Page's page when it is the only one", async () => {
    stubApi({
      "metaLeads.connectFinish": { data: aSharedList() },
      "metaLeads.connectPages": { data: { connected: [{ id: pageRowId, pageId: "100000000000001" }], refused: [] } },
    });
    renderScreen(<MetaCallbackScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect 1 Page" }));
    await waitFor(() => {
      expect(routerCalls.replace).toHaveBeenCalledWith(metaPageRoute(pageRowId));
    });
    expect(inputsTo("metaLeads.connectPages")).toEqual([{ pageIds: ["100000000000001"] }]);
  });

  it("can untick a Page, which leaves Connect off with nothing ticked", async () => {
    stubApi({ "metaLeads.connectFinish": { data: aSharedList() } });
    renderScreen(<MetaCallbackScreen />);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Rajasthan Holidays" }));
    expect(screen.getByRole("button", { name: "Connect Pages" })).toBeDisabled();
  });

  it("goes back to the list when several were connected, and says which Page could not be", async () => {
    const shared = aSharedList({
      pages: [
        { pageId: "1", name: "First Page", availability: "available" },
        { pageId: "2", name: "Second Page", availability: "available" },
      ],
    });
    stubApi({
      "metaLeads.connectFinish": { data: shared },
      "metaLeads.connectPages": {
        data: { connected: [{ id: pageRowId, pageId: "1" }], refused: [{ pageId: "2", reason: "META_PAGE_LIMIT" }] },
      },
    });
    renderScreen(<MetaCallbackScreen />);
    await userEvent.click(await screen.findByRole("button", { name: "Connect 2 Pages" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/Second Page couldn't be connected\./)).toBeVisible();
    expect(within(alert).getByText(new RegExp(messages.errors.reasons.META_PAGE_LIMIT.slice(0, 20)))).toBeVisible();
    expect(screen.getByRole("link", { name: messages.metaLeads.connect.back })).toHaveAttribute(
      "href",
      routes.leadSources,
    );
  });

  it("says a cancelled dialog and offers to start again, posting nothing", async () => {
    comeBackTo("?error=access_denied&error_reason=user_denied");
    stubApi({});
    renderScreen(<MetaCallbackScreen />);
    expect(await screen.findByText(words.cancelled)).toBeVisible();
    expect(screen.getByRole("link", { name: words.startAgain })).toHaveAttribute("href", metaConnectRoute);
    expect(inputsTo("metaLeads.connectFinish")).toEqual([]);
    expect(window.location.search).toBe("");
  });

  it("says the refusal's sentence when the login is refused", async () => {
    stubApi({ "metaLeads.connectFinish": { status: 400, reason: "META_PERMISSION_MISSING" } });
    renderScreen(<MetaCallbackScreen />);
    expect(await screen.findByText(messages.errors.reasons.META_PERMISSION_MISSING)).toBeVisible();
    expect(screen.getByRole("link", { name: words.startAgain })).toBeVisible();
  });

  it("finishes a reconnect inside the call and goes to the Page", async () => {
    stubApi({ "metaLeads.connectFinish": { data: aSharedList({ reconnectPageRowId: pageRowId }) } });
    renderScreen(<MetaCallbackScreen />);
    await waitFor(() => {
      expect(routerCalls.replace).toHaveBeenCalledWith(metaPageRoute(pageRowId));
    });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
