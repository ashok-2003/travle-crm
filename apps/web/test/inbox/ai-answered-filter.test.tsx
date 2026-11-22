// The inbox's Answered by the AI filter, opened from the AI agent page's Chats answered (/inbox?show=ai-answered): read
// from the address once, it asks for those chats alone, afresh (nothing kept from before narrows them), and leaves the
// address plain /inbox, so Back never finds ?show= again. It shows as a chosen chip with a ✕, stays on while a chat is
// opened, and goes, for good, when its chip is pressed or another chip is chosen.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InboxList } from "@/inbox/inbox-list";
import { messages } from "@/i18n/messages";
import { address, routerCalls } from "../leads/navigation";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

vi.mock("next/navigation", () => import("../leads/navigation"));

const t = messages.inbox;
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });

/** The inputs of every chat list asked for, in order. */
function api() {
  const asked: Record<string, unknown>[] = [];
  stubApi({
    "inbox.conversations": (input) => {
      asked.push(input as Record<string, unknown>);
      return { data: { items: [], nextCursor: null } };
    },
    "inbox.tags": { data: [] },
  });
  return asked;
}

function show(href: string) {
  address.set(href);
  return renderWithApi(<InboxList currentId={null} />, client(), member({ isOwner: true }));
}

beforeEach(() => {
  screenIs("wide");
  window.sessionStorage.clear();
});

describe("the inbox's Answered by the AI filter", () => {
  it("asks for the chats the AI answered, afresh, says so as a chosen chip, and leaves the address plain", async () => {
    window.sessionStorage.setItem("travel-crm.inbox.stage", "won");
    window.sessionStorage.setItem("travel-crm.inbox.search", "Meera");
    const asked = api();
    show("/inbox?show=ai-answered");
    expect(await screen.findByText(t.aiAnswered.empty)).toBeInTheDocument();
    expect(asked.every((input) => JSON.stringify(input) === JSON.stringify({ filter: "ai_answered" }))).toBe(true);
    expect(routerCalls.replace).toHaveBeenLastCalledWith("/inbox");
    expect(address.href).toBe("/inbox");
    const chip = screen.getByRole("button", { name: t.aiAnswered.label, pressed: true });
    expect(chip).toHaveAccessibleDescription(t.aiAnswered.hint);
    expect(window.sessionStorage.getItem("travel-crm.inbox.stage")).toBeNull();
  });

  it("stays on when the list comes back without the address, as when a chat is opened", async () => {
    api();
    show("/inbox?show=ai-answered").unmount();
    const asked = api();
    show("/inbox/0199a000-0000-7000-8000-0000000000c1");
    await screen.findByRole("button", { name: t.aiAnswered.label });
    expect(asked.at(-1)).toMatchObject({ filter: "ai_answered" });
  });

  it("goes when its chip is pressed, and stays gone when the list comes back (Back from a chat)", async () => {
    const asked = api();
    const view = show("/inbox?show=ai-answered");
    await userEvent.click(await screen.findByRole("button", { name: t.aiAnswered.label }));
    await waitFor(() => {
      expect(asked.at(-1)).toMatchObject({ filter: "mine" });
    });
    expect(screen.queryByRole("button", { name: t.aiAnswered.label })).not.toBeInTheDocument();
    view.unmount();
    const again = api();
    show("/inbox");
    await waitFor(() => {
      expect(again.at(-1)).toMatchObject({ filter: "mine" });
    });
    expect(screen.queryByRole("button", { name: t.aiAnswered.label })).not.toBeInTheDocument();
  });

  it("clears the kept choices only once: a choice made after it survives the list coming back", async () => {
    api();
    show("/inbox?show=ai-answered").unmount();
    // A choice the member makes afterwards, kept in the tab as every choice is.
    window.sessionStorage.setItem("travel-crm.inbox.stage", "won");
    const asked = api();
    show("/inbox");
    await waitFor(() => {
      expect(asked.at(-1)).toMatchObject({ filter: "ai_answered", stage: "won" });
    });
  });

  it("goes when another chip is chosen", async () => {
    const asked = api();
    show("/inbox?show=ai-answered");
    await screen.findByRole("button", { name: t.aiAnswered.label });
    await userEvent.click(screen.getByRole("radio", { name: t.filterWaiting }));
    await waitFor(() => {
      expect(asked.at(-1)).toMatchObject({ filter: "waiting" });
    });
    expect(screen.queryByRole("button", { name: t.aiAnswered.label })).not.toBeInTheDocument();
  });

  it("is not there on the plain inbox, which starts on Mine (owner, 2026-11-22)", async () => {
    const asked = api();
    show("/inbox");
    await waitFor(() => {
      expect(asked.at(-1)).toMatchObject({ filter: "mine" });
    });
    expect(screen.getByRole("radio", { name: new RegExp(`^${t.filterMine}`) })).toBeChecked();
    expect(screen.queryByRole("button", { name: t.aiAnswered.label })).not.toBeInTheDocument();
  });
});
