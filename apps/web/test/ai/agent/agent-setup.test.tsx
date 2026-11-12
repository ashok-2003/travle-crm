// The Setup tab's checklist: each step's state, one editor open at a time, payment kept to who manages settings, and the
// switch that stays off until the steps are done.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { brand } from "@travel-crm/brand";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentScreen } from "@/ai/agent/agent-screen";
import { messages } from "@/i18n/messages";
import { address } from "../../leads/navigation";
import { newQueryClient, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { member } from "../../support/members";
import { recordingApi } from "./setup-api";

vi.mock("next/navigation", () => import("../../leads/navigation"));

const t = messages.aiAgent.setup;
const step = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  done: false,
  optional: key === "ads",
  count: null,
  total: null,
  ...over,
});
const steps = [
  step("whatsapp", { done: true }),
  step("packages", { done: true, count: 2, total: 2 }),
  step("payment"),
  step("answers", { count: 4, total: 6 }),
  step("basics"),
  step("ads", { count: 1, total: 3 }),
];
const setup = { steps, ready: false, on: false, pausedBySupport: false };
const owner = member({ isOwner: true });

function show(over: Record<string, unknown> = {}, me = owner, extra: Record<string, never> = {}) {
  const api = recordingApi({ "ai.agentSetup": { data: { ...setup, ...over } }, ...extra });
  renderWithApi(<AgentScreen />, newQueryClient(), me);
  return api;
}

beforeEach(() => {
  screenIs("wide");
  address.set("/ai-agent?tab=setup");
});

describe("the Setup checklist", () => {
  it("states each step in words", async () => {
    show();
    await screen.findByText(t.steps.answers.count.replace("{count}", "4").replace("{total}", "6"));
    expect(screen.getByText("2 packages the AI can sell")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 ads linked")).toBeInTheDocument();
    expect(screen.getByText(t.steps.payment.todo)).toBeInTheDocument();
    expect(screen.getAllByText(t.done)).toHaveLength(2);
    expect(screen.getAllByText(t.todo)).toHaveLength(3);
    expect(screen.getAllByText(t.optional)).toHaveLength(1);
  });

  it("links WhatsApp and Packages to their own screens", async () => {
    show();
    expect(await screen.findByRole("link", { name: t.steps.whatsapp.open })).toHaveAttribute(
      "href",
      "/settings/whatsapp",
    );
    expect(screen.getByRole("link", { name: t.steps.packages.open })).toHaveAttribute("href", "/packages");
  });

  it("opens one editor at a time", async () => {
    show({}, owner, {
      "ai.agencyAnswers": { data: {} },
      "ai.agentBasics": { data: { agentName: "", tone: "friendly" } },
    } as never);
    await userEvent.click(await screen.findByRole("button", { name: `Edit ${t.steps.answers.title}` }));
    expect(await screen.findByRole("button", { name: t.answers.save })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: `Edit ${t.steps.basics.title}` }));
    expect(await screen.findByRole("button", { name: t.basics.save })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.answers.save })).not.toBeInTheDocument();
  });

  it("shows a member without settings access only the state of the payment step", async () => {
    show({}, member({ permissions: ["ai:manage"] }));
    await screen.findByText(t.steps.payment.askManager);
    expect(screen.queryByRole("button", { name: `Edit ${t.steps.payment.title}` })).not.toBeInTheDocument();
  });
});

describe("the switch that turns the agent on", () => {
  it("is off and says why until the steps are done", async () => {
    show();
    const control = await screen.findByRole("switch", { name: t.turnOn.title });
    expect(control).toBeDisabled();
    expect(screen.getByText(t.turnOn.finishFirst)).toBeInTheDocument();
  });

  it("turns the agent on once ready", async () => {
    const api = show({ ready: true });
    api.answer("ai.setAgentOn", { data: { ...setup, ready: true, on: true } });
    await userEvent.click(await screen.findByRole("switch", { name: t.turnOn.title }));
    await waitFor(() => {
      expect(api.sent("ai.setAgentOn")).toEqual([{ on: true }]);
    });
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: t.turnOn.title })).toBeChecked();
    });
  });

  it("shows a refusal", async () => {
    const api = show({ ready: true });
    api.answer("ai.setAgentOn", { status: 409, reason: "AGENT_SETUP_INCOMPLETE" });
    await userEvent.click(await screen.findByRole("switch", { name: t.turnOn.title }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.errors.reasons.AGENT_SETUP_INCOMPLETE);
  });

  it("says when support has paused it, and keeps the switch as the owner set it", async () => {
    show({ ready: true, on: true, pausedBySupport: true });
    expect(await screen.findByText(t.turnOn.paused.replace("{product}", brand.productName))).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: t.turnOn.title })).toBeChecked();
  });
});
