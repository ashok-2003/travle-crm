// Connecting a Page, step 1 (spec 3.2): what we do with the Page in a sentence, and Continue with Facebook, which asks the api
// for Facebook's dialog and leaves for it. A refusal says its sentence and the page stays; the subscription's hint turns it off.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { MetaConnectScreen } from "@/lead-sources/meta/connect/meta-connect-screen";
import { loadPage } from "@/lib/navigate";
import { routes } from "@/lib/routes";
import { renderScreen, inputsTo } from "../../../leads/screen";
import { newQueryClient, paidSubscription, renderWithApi } from "../../../organization/api";
import { screenIs } from "../../../organization/render";
import { stubApi } from "../../../support/api-stub";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(loadPage).mockClear();
});

const words = messages.metaLeads.connect;
const dialog = "https://www.facebook.com/v25.0/dialog/oauth?client_id=1&state=abc";

describe("MetaConnectScreen", () => {
  it("says what we do with the Page, and goes to Facebook's dialog when asked", async () => {
    stubApi({ "metaLeads.connectStart": { data: { authorizeUrl: dialog, expiresAt: "2026-10-23T08:10:00.000Z" } } });
    renderScreen(<MetaConnectScreen />);
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByText(words.intro)).toBeVisible();
    expect(screen.getByRole("link", { name: words.back })).toHaveAttribute("href", routes.leadSources);
    await userEvent.click(screen.getByRole("button", { name: words.continue }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(dialog);
    });
    expect(inputsTo("metaLeads.connectStart")).toEqual([{}]);
    // It stays on "Opening Facebook…" while the browser leaves, so it can't be pressed twice.
    expect(screen.getByRole("button", { name: words.opening })).toBeDisabled();
  });

  it("says the refusal's sentence and stays", async () => {
    stubApi({ "metaLeads.connectStart": { status: 409, reason: "META_NOT_IN_DEMO" } });
    renderScreen(<MetaConnectScreen />);
    await userEvent.click(screen.getByRole("button", { name: words.continue }));
    expect(await screen.findByText(messages.errors.reasons.META_NOT_IN_DEMO)).toBeVisible();
    expect(loadPage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: words.continue })).toBeEnabled();
  });

  it("turns Continue off with the hint while the agency is read-only", () => {
    stubApi({});
    screenIs("phone");
    renderWithApi(
      <MetaConnectScreen />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
    );
    const button = screen.getByRole("button", { name: words.continue });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
  });
});
