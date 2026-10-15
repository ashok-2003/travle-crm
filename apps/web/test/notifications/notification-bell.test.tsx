// The bell (spec 9.4) as a member sees it: the unread count in the People violet, the list newest first and a page at
// a time, an item's link followed only when it is a path in the app, and marking one or all read, which clears the
// count at once and puts it back if the api refuses. Support impersonating the member reads it but can't mark it read.
import type { NotificationPage, NotificationSummary } from "@travel-crm/contracts/notifications";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { formatDay } from "@/lib/format";
import { NotificationBell } from "@/notifications/bell/notification-bell";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";
import { sentInputs } from "./sent-inputs";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }) }));

const { bell } = messages.notifications;
const t = createTranslator({ locale, messages, namespace: "notifications.bell" });

function notification(number: number, changes: Partial<NotificationSummary> = {}): NotificationSummary {
  return {
    id: `0199a000-0000-7000-8000-${String(number).padStart(12, "0")}`,
    kind: "share-link.opened",
    title: `Opened: Quotation ${String(number)}`,
    body: "The link you shared has just been opened.",
    link: null,
    createdAt: "2026-10-16T05:30:00.000Z",
    readAt: null,
    ...changes,
  };
}

const page = (notifications: NotificationSummary[], nextCursor: string | null = null): Answer => ({
  data: { notifications, nextCursor } satisfies NotificationPage,
});

function renderBell(answers: Record<string, Answer>, me = member({ name: "Asha" })) {
  const api = stubApi(answers);
  renderWithApi(<NotificationBell opensAs="popover" />, newQueryClient(), me);
  return api;
}

async function openBell(count: number) {
  await userEvent.click(await screen.findByRole("button", { name: t("label", { count }) }));
  return screen.findByRole("dialog", { name: bell.title });
}

/** jsdom can't load another page: a followed link stops at the document, after the app has handled the click. */
const stayOnPage = (event: MouseEvent) => {
  event.preventDefault();
};

beforeEach(() => {
  toast.error.mockClear();
  document.addEventListener("click", stayOnPage);
});

afterEach(() => {
  document.removeEventListener("click", stayOnPage);
  vi.unstubAllGlobals();
});

describe("NotificationBell", () => {
  it("shows the unread count in violet, and says it to screen readers", async () => {
    renderBell({ "notifications.unreadCount": { data: 3 } });
    const button = await screen.findByRole("button", { name: t("label", { count: 3 }) });
    expect(within(button).getByText("3")).toHaveClass("bg-people", "text-on-action", "numbers");
  });

  it("shows no count when everything is read", async () => {
    renderBell({ "notifications.unreadCount": { data: 0 } });
    expect(await screen.findByRole("button", { name: bell.title })).toHaveTextContent("");
  });

  it("caps a long count, and says the whole of it to screen readers", async () => {
    renderBell({ "notifications.unreadCount": { data: 1234 } });
    const busy = await screen.findByRole("button", { name: t("label", { count: 1234 }) });
    expect(within(busy).getByText(bell.manyUnread)).toBeVisible();
  });

  it("lists the newest first, and links an item only to a path in the app", async () => {
    renderBell({
      "notifications.unreadCount": { data: 2 },
      "notifications.list": page([
        notification(3, { link: "/settings/documents" }),
        notification(2, { link: "//evil.example/settings" }),
        notification(1, { readAt: "2026-10-16T06:00:00.000Z" }),
      ]),
    });
    const list = within(await openBell(2));
    const items = await list.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    const [linked, offSite, read] = items;
    if (!linked || !offSite || !read) throw new Error("three items expected");
    expect(linked).toHaveTextContent("Opened: Quotation 3");
    expect(offSite).toHaveTextContent("Opened: Quotation 2");
    expect(read).toHaveTextContent("Opened: Quotation 1");
    expect(within(linked).getByRole("link")).toHaveAttribute("href", "/settings/documents");
    expect(within(offSite).queryByRole("link")).toBeNull();
    expect(within(linked).getByText(bell.unread)).toHaveClass("sr-only");
    expect(within(read).queryByText(bell.unread)).toBeNull();
    // In the organization's zone: 05:30 UTC is 11:00 am in India ("16 Oct", with the year once it isn't this one).
    const day = formatDay(new Date("2026-10-16T05:30:00.000Z"), { timeZone: "Asia/Kolkata" });
    expect(within(linked).getByText(t("when", { day, time: "11:00 am" }))).toBeVisible();
  });

  it("marks an item read as its link is followed, and the count drops at once", async () => {
    renderBell({
      "notifications.unreadCount": { data: 2 },
      "notifications.list": page([notification(2, { link: "/settings/documents" }), notification(1)]),
      "notifications.markRead": "never",
    });
    const list = within(await openBell(2));
    await userEvent.click(await list.findByRole("link", { name: /Opened: Quotation 2/ }));
    expect(await screen.findByRole("button", { name: t("label", { count: 1 }) })).toBeVisible();
    expect(sentInputs("notifications.markRead")).toEqual([{ notificationIds: [notification(2).id] }]);
  });

  it("marks one item without a link read, or everything at once", async () => {
    const readAt = "2026-10-16T06:00:00.000Z";
    const api = renderBell({
      "notifications.unreadCount": { data: 2 },
      "notifications.list": page([notification(2), notification(1)]),
      "notifications.markRead": { data: 1 },
    });
    const list = within(await openBell(2));
    const [first] = await list.findAllByRole("listitem");
    if (!first) throw new Error("an item expected");
    // What the api answers once each mark has landed, when the bell asks again.
    api.answer("notifications.unreadCount", { data: 1 });
    api.answer("notifications.list", page([notification(2, { readAt }), notification(1)]));
    await userEvent.click(within(first).getByRole("button", { name: bell.markRead }));
    await screen.findByRole("button", { name: t("label", { count: 1 }) });
    api.answer("notifications.unreadCount", { data: 0 });
    api.answer("notifications.list", page([notification(2, { readAt }), notification(1, { readAt })]));
    await userEvent.click(list.getByRole("button", { name: bell.markAllRead }));
    await screen.findByRole("button", { name: bell.title });
    expect(sentInputs("notifications.markRead")).toEqual([{ notificationIds: [notification(2).id] }, { all: true }]);
    expect(list.queryByText(bell.unread)).toBeNull();
  });

  it("puts the count back and says why when the api refuses", async () => {
    renderBell({
      "notifications.unreadCount": { data: 1 },
      "notifications.list": page([notification(1)]),
      "notifications.markRead": { status: 403, reason: "ORGANIZATION_SUSPENDED" },
    });
    const list = within(await openBell(1));
    await userEvent.click(await list.findByRole("button", { name: bell.markAllRead }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(messages.errors.reasons.ORGANIZATION_SUSPENDED, expect.anything());
    });
    expect(screen.getByRole("button", { name: t("label", { count: 1 }) })).toBeVisible();
  });

  it("shows older notifications a page at a time", async () => {
    const api = renderBell({
      "notifications.unreadCount": { data: 0 },
      "notifications.list": page([notification(3), notification(2)], notification(2).id),
    });
    const list = within(await openBell(0));
    await list.findByText("Opened: Quotation 2");
    api.answer("notifications.list", page([notification(1)]));
    await userEvent.click(list.getByRole("button", { name: bell.showMore }));
    expect(await list.findByText("Opened: Quotation 1")).toBeVisible();
    expect(list.queryByRole("button", { name: bell.showMore })).toBeNull();
    expect(sentInputs("notifications.list")).toEqual([{ limit: 20 }, { limit: 20, cursor: notification(2).id }]);
  });

  it("says when there is nothing yet", async () => {
    renderBell({ "notifications.unreadCount": { data: 0 }, "notifications.list": page([]) });
    const list = within(await openBell(0));
    expect(await list.findByText(bell.empty)).toBeVisible();
    expect(list.queryByRole("button", { name: bell.markAllRead })).toBeNull();
  });

  it("says when the list didn't load, with a way to try again", async () => {
    const api = renderBell({ "notifications.unreadCount": { data: 0 }, "notifications.list": { status: 500 } });
    const list = within(await openBell(0));
    expect(await list.findByText(bell.loadFailed)).toBeVisible();
    api.answer("notifications.list", page([notification(1)]));
    await userEvent.click(list.getByRole("button", { name: messages.common.tryAgain }));
    expect(await list.findByText("Opened: Quotation 1")).toBeVisible();
  });

  it("lets support impersonating the member read the list, with no way to mark it read", async () => {
    renderBell(
      {
        "notifications.unreadCount": { data: 1 },
        "notifications.list": page([notification(1, { link: "/settings/documents" })]),
      },
      member({ name: "Asha", impersonatedBy: "0199a000-0000-7000-8000-0000000000ad" }),
    );
    const list = within(await openBell(1));
    expect(await list.findByText(t("impersonating", { name: "Asha" }))).toBeVisible();
    expect(list.queryByRole("button", { name: bell.markAllRead })).toBeNull();
    await userEvent.click(list.getByRole("link", { name: /Opened: Quotation 1/ }));
    expect(sentInputs("notifications.markRead")).toEqual([]);
  });
});
