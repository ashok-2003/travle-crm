// The Inbox's sound and desktop alerts (inbox revamp spec, part 1 items 5 and 6): off until turned on in the Inbox's menu,
// kept in the browser, the notification permission asked only as that switch goes on; an alert for a customer's message in
// the member's own chat (or an unassigned one, for whoever takes those) that isn't the one in front of them, once across
// tabs; and the menu lists the keyboard shortcuts.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsMenu } from "@/inbox/alerts-menu";
import { alertsMember, claimAlert, takesUnassigned } from "@/inbox/inbox-alerts";
import { useInboxAlerts } from "@/inbox/use-inbox-alerts";
import { MeProvider } from "@/session/me-context";
import { newQueryClient, renderWithApi, withApp } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";
import { answerApi } from "./answer-api";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const me = "0199a000-0000-7000-8000-000000000001";
const someoneElse = "0199a000-0000-7000-8000-0000000000ff";
const chat = "01900000-0000-7000-8000-00000000000a";
const leadOf = (ownerUserId: string | null) => ({ lead: { id: chat, stage: "new", ownerUserId, open: true } });

const seller = member({ permissions: ["inbox:view", "leads:view"] });
const assigner = member({ permissions: ["inbox:view", "leads:view", "leads:assign"] });

/** The browser's sound and notifications, as the tests watch them. */
const tones = vi.fn();
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn();
  createOscillator() {
    tones();
    return { type: "", frequency: { value: 0 }, connect: (next: unknown) => next, start: vi.fn(), stop: vi.fn() };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: (next: unknown) => next,
    };
  }
}
const shown: { title: string; options: NotificationOptions }[] = [];
function stubNotifications(permission: NotificationPermission, answer: NotificationPermission = permission) {
  const FakeNotification = Object.assign(
    function (this: { onclick: (() => void) | null; close: () => void }, title: string, options: NotificationOptions) {
      shown.push({ title, options });
      this.onclick = null;
      this.close = vi.fn();
    },
    { permission, requestPermission: vi.fn(() => Promise.resolve(answer)) },
  );
  vi.stubGlobal("Notification", FakeNotification);
  return FakeNotification;
}

beforeEach(() => {
  window.localStorage.clear();
  tones.mockClear();
  shown.length = 0;
  router.push.mockClear();
  screenIs("wide");
  vi.stubGlobal("AudioContext", FakeAudioContext);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("whose chats alert", () => {
  it("is the lead's owner's, and an unassigned chat is for whoever assigns or sees every chat or lead", () => {
    expect(alertsMember(seller, leadOf(me))).toBe(true);
    expect(alertsMember(seller, leadOf(someoneElse))).toBe(false);
    expect(alertsMember(seller, leadOf(null))).toBe(false);
    expect(alertsMember(assigner, leadOf(null))).toBe(true);
    expect(alertsMember(member({ isOwner: true }), { lead: null })).toBe(true);
    const everyChat = member({ permissions: ["inbox:view"] });
    everyChat.member.permissions = [{ permission: "inbox:view", scope: "all" }];
    expect(takesUnassigned(everyChat)).toBe(true);
    expect(takesUnassigned(seller)).toBe(false);
  });

  it("is given by one tab only for the same message", () => {
    expect(claimAlert(chat, 1_000)).toBe(true);
    expect(claimAlert(chat, 2_000)).toBe(false);
    expect(claimAlert(chat, 5_000)).toBe(true);
  });
});

describe("the alerts menu", () => {
  it("keeps the sound on once turned on, and sounds it", async () => {
    stubNotifications("default");
    renderWithApi(<AlertsMenu />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Alerts" }));
    const sound = await screen.findByRole("switch", { name: "Sound" });
    expect(sound).not.toBeChecked();
    await userEvent.click(sound);
    expect(sound).toBeChecked();
    expect(window.localStorage.getItem("travel-crm.inbox.alerts.sound")).toBe("on");
    expect(tones).toHaveBeenCalled();
  });

  it("asks the browser for notifications only as they are turned on, and says when the browser blocks them", async () => {
    const allowing = stubNotifications("default", "granted");
    const view = renderWithApi(<AlertsMenu />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Alerts" }));
    expect(allowing.requestPermission).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("switch", { name: "Desktop notifications" }));
    expect(allowing.requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch", { name: "Desktop notifications" })).toBeChecked();
    expect(window.localStorage.getItem("travel-crm.inbox.alerts.desktop")).toBe("on");
    view.unmount();

    window.localStorage.clear();
    stubNotifications("default", "denied");
    renderWithApi(<AlertsMenu />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Alerts" }));
    await userEvent.click(await screen.findByRole("switch", { name: "Desktop notifications" }));
    expect(screen.getByRole("switch", { name: "Desktop notifications" })).not.toBeChecked();
    expect(screen.getByText(/This browser blocks our notifications/)).toBeInTheDocument();
    expect(window.localStorage.getItem("travel-crm.inbox.alerts.desktop")).toBeNull();
  });

  it("lists the keyboard shortcuts", async () => {
    stubNotifications("default");
    renderWithApi(<AlertsMenu />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Alerts" }));
    await userEvent.click(await screen.findByRole("button", { name: "Keyboard shortcuts" }));
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("Search the chats")).toBeInTheDocument();
    expect(within(dialog).getByText("Ctrl+K (⌘K on a Mac)")).toBeInTheDocument();
    expect(within(dialog).getByText("Close the contact details")).toBeInTheDocument();
  });
});

describe("an alert", () => {
  const header = (ownerUserId: string | null): ConversationHeader =>
    ({
      id: chat,
      phone: "+919876543210",
      name: "Meera Rao",
      ...leadOf(ownerUserId),
    }) as ConversationHeader;

  function alerts(openId: string | null, ownerUserId: string | null = me) {
    answerApi({ "inbox.conversation": header(ownerUserId) });
    const queryClient = newQueryClient();
    const Providers = withApp(queryClient);
    return renderHook(() => useInboxAlerts(openId), {
      wrapper: ({ children }) => (
        <Providers>
          <MeProvider me={seller}>{children}</MeProvider>
        </Providers>
      ),
    }).result.current;
  }

  it("sounds and shows 'New message from <name>' for the member's chat, which opens it", async () => {
    stubNotifications("granted");
    window.localStorage.setItem("travel-crm.inbox.alerts.sound", "on");
    window.localStorage.setItem("travel-crm.inbox.alerts.desktop", "on");
    const alert = alerts(null);
    act(() => {
      alert(chat);
    });
    await waitFor(() => {
      expect(shown).toEqual([{ title: "New message from Meera Rao", options: { tag: `inbox-${chat}` } }]);
    });
    expect(tones).toHaveBeenCalled();
  });

  it("says nothing while both are off, for someone else's chat, or for the chat in front of the member", async () => {
    stubNotifications("granted");
    alerts(null)(chat);
    window.localStorage.setItem("travel-crm.inbox.alerts.sound", "on");
    alerts(null, someoneElse)(chat);
    // Its header answered before the next case's api takes over.
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The chat open, in a tab in view with the focus: in front of the member.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    alerts(chat)(chat);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tones).not.toHaveBeenCalled();
    expect(shown).toEqual([]);
  });
});
