// The AI agent page's frame: its state beside the title, Setup at the top right ("Setup · 4 of 7" until every step is
// done), two tabs (Overview and Try it, ?tab=try), and an old ?tab=setup address sent on to the Setup page.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentScreen } from "@/ai/agent/agent-screen";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { stubApi } from "../../support/api-stub";
import { member } from "../../support/members";
import { address, routerCalls } from "../../leads/navigation";

vi.mock("next/navigation", () => import("../../leads/navigation"));

const t = messages.aiAgent;
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
const step = (key: string, done: boolean) => ({ key, done, optional: key === "ads", count: null, total: null });
const keys = ["ai", "whatsapp", "packages", "payment", "answers", "basics", "ads"];
/** A checklist with the first `done` of its seven steps done. */
const checklist = (done: number) => ({
  steps: keys.map((key, index) => step(key, index < done)),
  ready: done === keys.length,
  on: false,
  pausedBySupport: false,
});

function api(setup: unknown = checklist(4)) {
  return stubApi({
    "ai.agentSetup": { data: setup },
    "ai.handedOver": { data: [] },
    "ai.stageSuggestions": { data: { suggestions: [] } },
    "ai.overview": { data: { chatsAnswered: 0, messagesSent: 0, flagged: 0, bookingsRequested: 0 } },
    "paymentsToCheck.count": { data: { count: 0 } },
  });
}

async function open(href: string) {
  address.set(href);
  renderWithApi(<AgentScreen />, client(), member({ isOwner: true }));
  await screen.findByRole("tab", { name: t.tabs.overview });
}

beforeEach(() => {
  screenIs("wide");
  api();
});

describe("the AI agent page's header", () => {
  it("shows the agent's state beside the title, outside the heading", async () => {
    await open("/ai-agent");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(t.title);
    expect(await screen.findByText(t.state.notSetUp)).toBeInTheDocument();
    expect(within(heading).queryByText(t.state.notSetUp)).not.toBeInTheDocument();
    expect(screen.getByText(t.intro)).toBeInTheDocument();
  });

  it("opens Setup, saying how far it has come while steps are left", async () => {
    await open("/ai-agent");
    expect(await screen.findByRole("link", { name: "Setup · 4 of 7" })).toHaveAttribute("href", "/ai-agent/setup");
  });

  it("reads plain Setup once every step is done", async () => {
    api(checklist(7));
    await open("/ai-agent");
    await screen.findByText(t.state.off);
    expect(screen.getByRole("link", { name: t.setupButton.done })).toHaveAttribute("href", "/ai-agent/setup");
  });
});

describe("the AI agent page's tabs", () => {
  it("are Overview and Try it, and no Setup", async () => {
    await open("/ai-agent");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([t.tabs.overview, t.tabs.try]);
  });

  it("opens Try it with the test box from ?tab=try", async () => {
    await open("/ai-agent?tab=try");
    expect(screen.getByRole("tab", { name: t.tabs.try, selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText(messages.ai.test.message)).toBeVisible();
  });

  it("keeps Try it in the address, and Overview as the page's own", async () => {
    await open("/ai-agent");
    await userEvent.click(screen.getByRole("tab", { name: t.tabs.try }));
    expect(routerCalls.replace).toHaveBeenLastCalledWith("/ai-agent?tab=try");
    await userEvent.click(screen.getByRole("tab", { name: t.tabs.overview }));
    expect(routerCalls.replace).toHaveBeenLastCalledWith("/ai-agent");
  });

  it("opens Try it even when the setup checklist fails to load", async () => {
    stubApi({ "ai.agentSetup": { status: 500, reason: "INTERNAL" } });
    address.set("/ai-agent?tab=try");
    renderWithApi(<AgentScreen />, client());
    expect(await screen.findByLabelText(messages.ai.test.message)).toBeVisible();
    expect(screen.getByRole("link", { name: t.setupButton.done })).toBeInTheDocument();
  });

  it("falls back to Overview for an unknown tab", async () => {
    await open("/ai-agent?tab=nonsense");
    expect(screen.getByRole("tab", { name: t.tabs.overview, selected: true })).toBeInTheDocument();
    expect(screen.queryByLabelText(messages.ai.test.message)).not.toBeInTheDocument();
  });

  it("sends an old ?tab=setup address on to the Setup page, at the step it named", async () => {
    window.location.hash = "#step-payment";
    await open("/ai-agent?tab=setup");
    await waitFor(() => {
      expect(routerCalls.replace).toHaveBeenLastCalledWith("/ai-agent/setup#step-payment");
    });
    window.location.hash = "";
  });
});
