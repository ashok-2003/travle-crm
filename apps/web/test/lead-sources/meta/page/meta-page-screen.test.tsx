// A connected Page's page (spec 3.3): its name, badge and who connected it and when, Last checked in the agency's zone, Check
// now (Checking…, running late, a second press refused), the four counts, its forms with Bring in or Edit questions, what
// stopped it with the one thing to do, the menu (Pause, Resume, Reconnect, Disconnect), and what stays open while the agency
// is read-only.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { MetaPageScreen } from "@/lead-sources/meta/page/meta-page-screen";
import { loadPage } from "@/lib/navigate";
import { metaFormRoute, routes } from "@/lib/routes";
import { renderScreen, inputsTo } from "../../../leads/screen";
import { routerCalls } from "../../../leads/navigation";
import { newQueryClient, paidSubscription, renderWithApi } from "../../../organization/api";
import { screenIs } from "../../../organization/render";
import { heldAnswer, stubApi } from "../../../support/api-stub";
import { aForm, aFormList, aPageDetail, aProblemList, formRowId, pageRowId } from "../records";

vi.mock("next/navigation", () => import("../../../leads/navigation"));
vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  routerCalls.push.mockClear();
  vi.mocked(loadPage).mockClear();
});

const words = messages.metaLeads.page;

function renderPage(detail = aPageDetail(), extra: Parameters<typeof stubApi>[0] = {}) {
  const api = stubApi({
    "metaLeads.get": { data: detail },
    "metaLeads.forms": { data: aFormList() },
    "metaLeads.problems": { data: aProblemList() },
    "metaLeads.list": { data: { items: [], limit: 5, configured: true, demo: false } },
    ...extra,
  });
  renderScreen(<MetaPageScreen pageId={pageRowId} />, { width: "wide" });
  return api;
}

describe("MetaPageScreen", () => {
  it("shows the name, badge, who connected it and when, and Last checked in the agency's zone", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Rajasthan Holidays" })).toBeVisible();
    expect(screen.getByText(messages.metaLeads.badges.running)).toBeVisible();
    expect(screen.getByText("Connected by Asha Sharma on 12 Oct")).toBeVisible();
    expect(screen.getByText("Last checked 10:42 am")).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute("href", routes.leadSources);
  });

  it("names no one for a former member, says not checked yet, and says checks are running late", async () => {
    renderPage(aPageDetail({ connectedBy: { userId: "x", name: null }, lastCheckedAt: null, late: true }));
    expect(await screen.findByText("Connected on 12 Oct")).toBeVisible();
    expect(screen.getByText(words.notChecked)).toBeVisible();
    expect(screen.getByText(words.late)).toBeVisible();
  });

  it("shows the four counts in mono and the note under them", async () => {
    renderPage(aPageDetail({ counts: { added: 12_145, mergedIntoExisting: 37, duplicates: 18, couldntBeAdded: 0 } }));
    expect(await screen.findByText("12,145")).toHaveClass("numbers");
    for (const label of ["added", "mergedIntoExisting", "duplicates", "couldntBeAdded"] as const) {
      expect(screen.getByText(words.counts[label])).toBeVisible();
    }
    expect(screen.getByText(words.counts.notes)).toBeVisible();
    // Nothing couldn't be added: no list of problems.
    expect(screen.queryByRole("heading", { name: messages.metaLeads.problems.heading })).toBeNull();
  });

  it("shows Checking… while Check now is out, and refuses a second press with its sentence", async () => {
    const held = heldAnswer({ data: null });
    const api = renderPage(aPageDetail(), { "metaLeads.checkNow": held.answer });
    await userEvent.click(await screen.findByRole("button", { name: words.checkNow }));
    expect(await screen.findByRole("button", { name: words.checking })).toBeDisabled();
    expect(inputsTo("metaLeads.checkNow")).toEqual([{ pageId: pageRowId }]);
    held.release();
    await screen.findByRole("button", { name: words.checkNow });
    api.answer("metaLeads.checkNow", { status: 409, reason: "META_BUSY" });
    await userEvent.click(screen.getByRole("button", { name: words.checkNow }));
    expect(await screen.findByText(messages.errors.reasons.META_BUSY)).toBeVisible();
  });

  it("says Checking… while a check runs on its own", async () => {
    renderPage(aPageDetail({ checkRunning: true }));
    expect(await screen.findByRole("button", { name: words.checking })).toBeDisabled();
  });

  it("lists the forms, Bring in for one not brought in and Edit questions for one that is, and says how many leads it skipped", async () => {
    renderPage(aPageDetail(), {
      "metaLeads.forms": {
        data: aFormList([
          aForm(),
          aForm({
            id: "0199e7a0-0000-7000-8000-0000000000c2",
            name: "Diwali offers",
            state: "not_brought_in",
            leadsAdded: 0,
            lastLeadAt: null,
            skippedLeads: 3,
            metaStatus: "ARCHIVED",
          }),
        ]),
      },
    });
    const table = await screen.findByRole("table", { name: messages.metaLeads.forms.listLabel });
    const [brought, notBrought] = within(table).getAllByRole("row").slice(1);
    if (brought === undefined || notBrought === undefined) throw new Error("rows missing");
    expect(brought).toHaveTextContent("Rajasthan winter ad");
    expect(brought).toHaveTextContent(messages.metaLeads.forms.states.running);
    expect(brought).toHaveTextContent("1,286");
    expect(within(brought).getByRole("link", { name: "Edit the questions of Rajasthan winter ad" })).toHaveAttribute(
      "href",
      metaFormRoute(pageRowId, formRowId, "questions"),
    );
    expect(notBrought).toHaveTextContent(messages.metaLeads.forms.states.not_brought_in);
    expect(notBrought).toHaveTextContent("Archived");
    expect(notBrought).toHaveTextContent("3 leads came while this form wasn't brought in.");
    expect(within(notBrought).getByRole("link", { name: "Bring in Diwali offers" })).toHaveAttribute(
      "href",
      metaFormRoute(pageRowId, "0199e7a0-0000-7000-8000-0000000000c2", "bring-in"),
    );
  });

  it("says a Page has no forms yet", async () => {
    renderPage(aPageDetail(), { "metaLeads.forms": { data: aFormList([]) } });
    expect(await screen.findByText(messages.metaLeads.forms.empty)).toBeVisible();
  });

  it("says the forms didn't load, with Try again, while the rest of the page works", async () => {
    renderPage(aPageDetail(), { "metaLeads.forms": { status: 502 } });
    expect(await screen.findByText(messages.metaLeads.forms.loadFailed)).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Rajasthan Holidays" })).toBeVisible();
    expect(screen.getByText(words.counts.heading)).toBeVisible();
  });

  it("says Facebook stopped sharing the Page and leaves for Facebook's dialog on Reconnect", async () => {
    renderPage(
      aPageDetail({ status: "needs_reconnect", badge: "needs_reconnect", attentionSince: "2026-10-22T05:00:00.000Z" }),
      {
        "metaLeads.reconnect": {
          data: { authorizeUrl: "https://www.facebook.com/dialog", expiresAt: "2026-10-23T08:10:00.000Z" },
        },
      },
    );
    expect(await screen.findByText(words.attention.needs_reconnect.title)).toBeVisible();
    expect(screen.getByText("Since 22 Oct.")).toBeVisible();
    // No check can be asked of a Page that Facebook stopped sharing.
    expect(screen.getByRole("button", { name: words.checkNow })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: words.attention.reconnect }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("https://www.facebook.com/dialog");
    });
    expect(inputsTo("metaLeads.reconnect")).toEqual([{ pageId: pageRowId }]);
  });

  it("warns a week ahead that Facebook's access ends", async () => {
    renderPage(aPageDetail({ tokenExpiresAt: "2026-10-28T05:00:00.000Z" }));
    expect(await screen.findByText("Facebook's access for this Page ends on 28 Oct")).toBeVisible();
    expect(screen.getByRole("button", { name: words.attention.reconnect })).toBeVisible();
  });

  it("says a paused Page can resume, and resumes it", async () => {
    renderPage(aPageDetail({ status: "paused", badge: "paused" }), { "metaLeads.resume": { data: null } });
    expect(await screen.findByText(words.attention.paused.title)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.attention.resume }));
    await waitFor(() => {
      expect(inputsTo("metaLeads.resume")).toEqual([{ pageId: pageRowId }]);
    });
  });

  it("points at the forms when a form's questions changed", async () => {
    renderPage(aPageDetail({ badge: "needs_attention" }));
    expect(await screen.findByText(words.attention.forms.title)).toBeVisible();
  });

  it("pauses from the menu, and disconnects only after asking, then goes back to the list", async () => {
    renderPage(aPageDetail(), { "metaLeads.pause": { data: null }, "metaLeads.disconnect": { data: null } });
    await userEvent.click(await screen.findByRole("button", { name: words.menu }));
    await userEvent.click(await screen.findByRole("menuitem", { name: words.pause }));
    await waitFor(() => {
      expect(inputsTo("metaLeads.pause")).toEqual([{ pageId: pageRowId }]);
    });
    await userEvent.click(screen.getByRole("button", { name: words.menu }));
    await userEvent.click(await screen.findByRole("menuitem", { name: words.disconnect }));
    const asking = await screen.findByRole("alertdialog");
    expect(within(asking).getByText("Stop bringing in leads from Rajasthan Holidays?")).toBeVisible();
    expect(within(asking).getByText(messages.metaLeads.disconnect.description)).toBeVisible();
    expect(inputsTo("metaLeads.disconnect")).toEqual([]);
    await userEvent.click(within(asking).getByRole("button", { name: messages.metaLeads.disconnect.action }));
    await waitFor(() => {
      expect(routerCalls.push).toHaveBeenCalledWith(routes.leadSources);
    });
    expect(inputsTo("metaLeads.disconnect")).toEqual([{ pageId: pageRowId }]);
  });

  it("keeps Pause and Disconnect open on a read-only agency and turns Check now and Reconnect off with the hint", async () => {
    stubApi({
      "metaLeads.get": { data: aPageDetail({ readOnly: true }) },
      "metaLeads.forms": { data: aFormList() },
    });
    screenIs("wide");
    renderWithApi(
      <MetaPageScreen pageId={pageRowId} />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
    );
    const check = await screen.findByRole("button", { name: words.checkNow });
    expect(check).toBeDisabled();
    expect(check).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
    expect(screen.getByText(words.attention.readOnly.title)).toBeVisible();
    // A running Page of a read-only agency saves nothing: it does not say Running.
    expect(screen.queryByText(messages.metaLeads.badges.running)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: words.menu }));
    expect(await screen.findByRole("menuitem", { name: words.pause })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: words.disconnect })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: words.reconnect })).toHaveAttribute("aria-disabled", "true");
  });

  it("shows the error with Try again when the Page can't be loaded", async () => {
    stubApi({ "metaLeads.get": { status: 404, reason: "NOT_FOUND" } });
    renderScreen(<MetaPageScreen pageId={pageRowId} />);
    expect(await screen.findByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });
});
