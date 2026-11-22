// The inbox's Answered by the AI filter, opened from the AI agent page's Chats answered (/inbox?show=ai-answered): it
// asks for those chats alone, afresh (nothing kept from before narrows them), shows as a chosen chip with a ✕, stays on
// while a chat is opened, and goes when its chip is pressed or another chip is chosen.
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
  it("asks for the chats the AI answered, afresh, and says so as a chosen chip", async () => {
    window.sessionStorage.setItem("travel-crm.inbox.stage", "won");
    window.sessionStorage.setItem("travel-crm.inbox.search", "Meera");
    const asked = api();
    show("/inbox?show=ai-answered");
    expect(await screen.findByText(t.aiAnswered.empty)).toBeInTheDocument();
    expect(asked.at(-1)).toEqual({ filter: "ai_answered" });
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

  it("goes when its chip is pressed, taking the address's ?show= with it", async () => {
    const asked = api();
    show("/inbox?show=ai-answered");
    await userEvent.click(await screen.findByRole("button", { name: t.aiAnswered.label }));
    expect(routerCalls.replace).toHaveBeenLastCalledWith("/inbox");
    await waitFor(() => {
      expect(asked.at(-1)).toMatchObject({ filter: "all" });
    });
    expect(screen.queryByRole("button", { name: t.aiAnswered.label })).not.toBeInTheDocument();
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

  it("is not there on the plain inbox", async () => {
    const asked = api();
    show("/inbox");
    await waitFor(() => {
      expect(asked.at(-1)).toMatchObject({ filter: "all" });
    });
    expect(screen.queryByRole("button", { name: t.aiAnswered.label })).not.toBeInTheDocument();
  });
});
