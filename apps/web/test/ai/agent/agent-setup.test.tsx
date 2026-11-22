// The Setup page: how far setup has come, each step's state with one button of one kind (Set up, Edit or Manage), one
// editor open at a time, payment kept to who manages settings, and the switch that stays off until the steps are done,
// saying so in one line (never the missing steps again).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { brand } from "@travel-crm/brand";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSetupScreen } from "@/ai/agent/agent-setup";
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
  step("ai", { done: true }),
  step("whatsapp", { done: true }),
  step("packages", { done: true, count: 2, total: 2 }),
  step("payment"),
  step("answers", { count: 4, total: 6 }),
  step("basics", { done: true }),
  step("ads", { count: 1, total: 3 }),
];
const setup = { steps, ready: false, on: false, pausedBySupport: false };
const owner = member({ isOwner: true });

/** The checklist row an element sits in. */
function rowOf(element: HTMLElement): HTMLElement {
  const row = element.closest('[data-slot="item"]');
  if (!(row instanceof HTMLElement)) throw new Error("not in a row");
  return row;
}

function show(over: Record<string, unknown> = {}, me = owner, extra: Record<string, never> = {}) {
  const api = recordingApi({ "ai.agentSetup": { data: { ...setup, ...over } }, ...extra });
  renderWithApi(<AgentSetupScreen />, newQueryClient(), me);
  return api;
}

beforeEach(() => {
  screenIs("wide");
  address.set("/ai-agent/setup");
});

afterEach(() => {
  window.location.hash = "";
});

describe("the Setup page", () => {
  it("has a way back to the AI agent", async () => {
    show();
    expect(await screen.findByRole("link", { name: t.back })).toHaveAttribute("href", "/ai-agent");
    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeInTheDocument();
  });

  it("says how far setup has come, with a bar", async () => {
    show();
    const bar = await screen.findByRole("progressbar", { name: "4 of 7 done" });
    expect(bar).toHaveAttribute("aria-valuenow", "57");
  });

  it("opens a step's editor and scrolls to it when the address names it", async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = function (this: Element) {
      scrollTo(this.id);
    };
    window.location.hash = "#step-payment";
    show({}, owner, { "organization.profile.get": { data: null } } as never);
    expect(await screen.findByRole("button", { name: `Close ${t.steps.payment.title}` })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(scrollTo).toHaveBeenCalledWith("step-payment");
    window.location.hash = "";
  });
});

describe("arriving at a step done on its own page", () => {
  it("scrolls to it, but opens nothing and calls its link nothing but Manage or Set up", async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollIntoView = function (this: Element) {
      scrollTo(this.id);
    };
    window.location.hash = "#step-whatsapp";
    show();
    expect(await screen.findByRole("link", { name: `Manage ${t.steps.whatsapp.title}` })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: `Close ${t.steps.whatsapp.title}` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Close / })).not.toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith("step-whatsapp");
    window.location.hash = "";
  });
});

describe("the Setup checklist", () => {
  it("states each step in words, once", async () => {
    show();
    await screen.findByText(t.steps.answers.count.replace("{count}", "4").replace("{total}", "6"));
    expect(screen.getByText("2 packages the AI can sell")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 ads linked")).toBeInTheDocument();
    expect(screen.getAllByText(t.steps.payment.todo)).toHaveLength(1);
    expect(screen.getAllByText(t.done)).toHaveLength(4);
    expect(screen.getAllByText(t.todo)).toHaveLength(2);
    expect(screen.getAllByText(t.optional)).toHaveLength(1);
  });

  it("gives each step one button: Manage a page's done step, Edit a done step here, Set up one to do", async () => {
    show();
    await screen.findByText(t.steps.basics.done);
    const buttons = (title: string) => {
      const row = within(rowOf(screen.getByText(title)));
      return [...row.queryAllByRole("link"), ...row.queryAllByRole("button")].map((button) => [
        button.tagName,
        button.getAttribute("aria-label"),
        button.getAttribute("href"),
      ]);
    };
    expect(buttons(t.steps.ai.title)).toEqual([["A", `Manage ${t.steps.ai.title}`, "/settings/ai"]]);
    expect(buttons(t.steps.whatsapp.title)).toEqual([["A", `Manage ${t.steps.whatsapp.title}`, "/settings/whatsapp"]]);
    expect(buttons(t.steps.packages.title)).toEqual([["A", `Manage ${t.steps.packages.title}`, "/packages"]]);
    expect(buttons(t.steps.payment.title)).toEqual([["BUTTON", `Set up ${t.steps.payment.title}`, null]]);
    expect(buttons(t.steps.answers.title)).toEqual([["BUTTON", `Set up ${t.steps.answers.title}`, null]]);
    expect(buttons(t.steps.basics.title)).toEqual([["BUTTON", `Edit ${t.steps.basics.title}`, null]]);
    expect(buttons(t.steps.ads.title)).toEqual([["BUTTON", `Set up ${t.steps.ads.title}`, null]]);
    // Never a "Connect your WhatsApp number" beside Done.
    expect(screen.queryByText(t.steps.whatsapp.todo)).not.toBeInTheDocument();
  });

  it("sends a step to do on its own page there with Set up", async () => {
    show({ steps: [step("whatsapp"), ...steps.slice(2)] });
    expect(await screen.findByRole("link", { name: `Set up ${t.steps.whatsapp.title}` })).toHaveAttribute(
      "href",
      "/settings/whatsapp",
    );
  });

  it("opens one editor at a time", async () => {
    show({}, owner, {
      "ai.agencyAnswers": { data: {} },
      "ai.agentBasics": { data: { agentName: "", tone: "friendly" } },
    } as never);
    await userEvent.click(await screen.findByRole("button", { name: `Set up ${t.steps.answers.title}` }));
    expect(await screen.findByRole("button", { name: t.answers.save })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: `Edit ${t.steps.basics.title}` }));
    expect(await screen.findByRole("button", { name: t.basics.save })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.answers.save })).not.toBeInTheDocument();
  });

  it("shows a member without settings access only the state of the payment step", async () => {
    show({}, member({ permissions: ["ai:manage"] }));
    await screen.findByText(t.steps.payment.askManager);
    expect(screen.queryByRole("button", { name: `Set up ${t.steps.payment.title}` })).not.toBeInTheDocument();
  });

  it("never asks for the payment details or the profile of a member without settings access", async () => {
    const api = show({}, member({ permissions: ["ai:manage"] }));
    await screen.findByText(t.steps.payment.askManager);
    expect(api.calls).not.toContain("organization.paymentDetails.get");
    expect(api.calls).not.toContain("organization.profile.get");
  });

  it("says to add payment details when packages are marked but held back by them", async () => {
    show({
      steps: steps.map((one) => (one.key === "packages" ? { ...one, done: false, count: 0, total: 2 } : one)),
    });
    expect(await screen.findByText(t.steps.packages.needsPayment)).toBeInTheDocument();
  });

  it("keeps the old line when no package is marked", async () => {
    show({
      steps: steps.map((one) => (one.key === "packages" ? { ...one, done: false, count: 0, total: 0 } : one)),
    });
    expect(await screen.findByText(t.steps.packages.todo)).toBeInTheDocument();
  });
});

describe("the switch that turns the agent on", () => {
  it("is off until the steps are done, and says so in one line, never listing them again", async () => {
    show();
    const control = await screen.findByRole("switch", { name: t.turnOn.title });
    expect(control).toBeDisabled();
    expect(control).toHaveAccessibleDescription(expect.stringContaining(t.turnOn.finishFirst));
    const row = rowOf(control);
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
    expect(within(row).queryByText(t.steps.payment.todo)).not.toBeInTheDocument();
  });

  it("is on but not answering: it says so in one line, and can be turned off", async () => {
    show({ on: true, ready: false });
    const control = await screen.findByRole("switch", { name: t.turnOn.title });
    expect(control).toBeEnabled();
    expect(control).toBeChecked();
    expect(control).toHaveAccessibleDescription(expect.stringContaining(t.turnOn.onButNotReady));
    expect(screen.queryByText(t.turnOn.finishFirst)).not.toBeInTheDocument();
  });

  it("says nothing more once every required step is done", async () => {
    show({ ready: true, steps: steps.map((one) => (one.optional ? one : { ...one, done: true })) });
    await screen.findByRole("switch", { name: t.turnOn.title });
    expect(screen.queryByText(t.turnOn.finishFirst)).not.toBeInTheDocument();
    expect(screen.queryByText(t.turnOn.onButNotReady)).not.toBeInTheDocument();
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
