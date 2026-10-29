// /account/notifications (spec 9.4): each person chooses, for everything and for each kind, whether it also reaches
// them by email and by push; a kind's own choice wins over everything, as delivery reads them. A change shows at once
// and goes back, with the reason, if the api refuses. Support impersonating the person sees the choices but can't
// change them, and staff without email are told why no email reaches them.
import type { NotificationPreference } from "@travel-crm/contracts/notifications";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { NotificationPreferencesScreen } from "@/notifications/preferences/preferences-screen";
import type { SignedInMember } from "@/session/me-context";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";
import { sentInputs } from "./sent-inputs";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { preferences } = messages.notifications;
const t = createTranslator({ locale, messages, namespace: "notifications.preferences" });

/** A member who signs in by email, so email can reach them. */
function withEmail(me: SignedInMember = member({ name: "Asha" })): SignedInMember {
  return { ...me, user: { ...me.user, email: "asha@sharma.example" } };
}

function renderScreen(answers: Record<string, Answer>, me: SignedInMember = withEmail()) {
  const api = stubApi({ "notifications.morning.get": { data: { enabled: true, time: "09:00" } }, ...answers });
  renderWithApi(<NotificationPreferencesScreen />, newQueryClient(), me);
  return api;
}

const choices = (list: NotificationPreference[]): Answer => ({ data: list });

/** The switch for one channel in one row ("Everything", or a kind's label). */
async function switchFor(row: string, channel: "email" | "push") {
  const group = await screen.findByRole("group", { name: row });
  return within(group).getByRole("switch", { name: preferences[channel] });
}

it("leads back to Your account", async () => {
  renderScreen({ "notifications.preferences": choices([]) });
  expect(await screen.findByRole("link", { name: messages.shell.navigation.account })).toHaveAttribute(
    "href",
    "/account",
  );
});

beforeEach(() => {
  toast.error.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NotificationPreferencesScreen", () => {
  it("shows email and push for everything and for each kind, a kind's own choice winning", async () => {
    renderScreen({
      "notifications.preferences.list": choices([
        { channel: "push", kind: "*", optedOut: true },
        { channel: "push", kind: "share-link.opened", optedOut: false },
      ]),
    });
    expect(await screen.findByRole("heading", { level: 1, name: preferences.title })).toBeVisible();
    const kind = preferences.kinds.shareLinkOpened.label;
    expect(await switchFor(preferences.everything.label, "email")).toBeChecked();
    expect(await switchFor(preferences.everything.label, "push")).not.toBeChecked();
    expect(await switchFor(kind, "email")).toBeChecked();
    expect(await switchFor(kind, "push")).toBeChecked();
    expect(screen.getByText(preferences.kindWins)).toBeVisible();
  });

  it("saves a change at once", async () => {
    renderScreen({
      "notifications.preferences.list": choices([]),
      "notifications.preferences.set": { data: { channel: "email", kind: "*", optedOut: true } },
    });
    const email = await switchFor(preferences.everything.label, "email");
    await userEvent.click(email);
    expect(email).not.toBeChecked();
    await waitFor(() => {
      expect(sentInputs("notifications.preferences.set")).toEqual([{ channel: "email", kind: "*", optedOut: true }]);
    });
  });

  it("moves a switch back, and says why, when the change fails", async () => {
    renderScreen({
      "notifications.preferences.list": choices([]),
      "notifications.preferences.set": { status: 500 },
    });
    const push = await switchFor(preferences.kinds.shareLinkOpened.label, "push");
    await userEvent.click(push);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(messages.errors.generic, expect.anything());
    });
    expect(push).toBeChecked();
  });

  it("lets support impersonating the person see the choices, but not change them", async () => {
    renderScreen(
      { "notifications.preferences.list": choices([]) },
      withEmail(member({ name: "Asha", impersonatedBy: "0199a000-0000-7000-8000-0000000000ad" })),
    );
    expect(await screen.findByText(t("impersonating", { name: "Asha" }))).toBeVisible();
    expect(await switchFor(preferences.everything.label, "email")).toBeDisabled();
    expect(await switchFor(preferences.kinds.shareLinkOpened.label, "push")).toBeDisabled();
  });

  it("tells staff without email why no email reaches them, and leaves push theirs to choose", async () => {
    renderScreen({ "notifications.preferences.list": choices([]) }, member());
    expect(await screen.findByText(preferences.noEmail)).toBeVisible();
    expect(await switchFor(preferences.everything.label, "email")).toBeDisabled();
    expect(await switchFor(preferences.everything.label, "push")).toBeEnabled();
  });

  it("says when the choices didn't load, with a way to try again", async () => {
    const api = renderScreen({ "notifications.preferences.list": { status: 500 } });
    expect(await screen.findByText(preferences.loadFailed)).toBeVisible();
    api.answer("notifications.preferences.list", choices([]));
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await switchFor(preferences.everything.label, "email")).toBeChecked();
  });
});

describe("the morning summary", () => {
  const { morning } = preferences;

  beforeEach(() => {
    // Radix's select asks the browser for these.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
  });

  it("is on at 9:00 for a person who never chose, and moves to the time they pick", async () => {
    renderScreen({
      "notifications.preferences.list": choices([]),
      "notifications.morning.set": { data: { enabled: true, time: "07:45" } },
    });
    expect(await screen.findByRole("heading", { name: morning.heading })).toBeVisible();
    const on = await screen.findByRole("switch", { name: morning.label });
    expect(on).toBeChecked();
    await userEvent.click(screen.getByRole("combobox", { name: morning.time }));
    await userEvent.click(await screen.findByRole("option", { name: "7:45 am" }));
    await waitFor(() => {
      expect(sentInputs("notifications.morning.set")).toEqual([{ enabled: true, time: "07:45" }]);
    });
  });

  it("switches off, and then offers no time", async () => {
    renderScreen({
      "notifications.preferences.list": choices([]),
      "notifications.morning.set": { data: { enabled: false, time: "09:00" } },
    });
    await userEvent.click(await screen.findByRole("switch", { name: morning.label }));
    await waitFor(() => {
      expect(sentInputs("notifications.morning.set")).toEqual([{ enabled: false, time: "09:00" }]);
    });
    await waitFor(() => {
      expect(screen.queryByRole("combobox", { name: morning.time })).toBeNull();
    });
  });

  it("can be seen but not changed by support impersonating the person", async () => {
    renderScreen(
      { "notifications.preferences.list": choices([]) },
      withEmail(member({ name: "Asha", impersonatedBy: "0199a000-0000-7000-8000-0000000000ad" })),
    );
    expect(await screen.findByRole("switch", { name: morning.label })).toBeDisabled();
  });
});
