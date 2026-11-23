// The AI agent page's switch for each WhatsApp number (spec 2026-11-22 section 8): one switch per live number, named by its
// label and number, shown once the agency has two (or while its one number is switched off), each sending its own
// number's id; the setup that comes back is what the page shows.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AgentStateBadge } from "@/ai/agent/agent-state";
import { NumberSwitches } from "@/ai/agent/number-switches";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { member } from "../../support/members";
import { recordingApi } from "./setup-api";

const t = messages.aiAgent.numbers;
const first = "0199a000-0000-7000-8000-0000000000d1";
const second = "0199a000-0000-7000-8000-0000000000d2";
const salesOne = "Sales 1 (+91 98765 00001)";
const salesTwo = "Sales 2 (+91 98765 00002)";

const aNumber = (id: string, label: string, aiAnswers: boolean) => ({
  id,
  label,
  displayNumber: id === first ? "+919876500001" : "+919876500002",
  aiAnswers,
});

const setupWith = (numbers: ReturnType<typeof aNumber>[]) => ({
  steps: [],
  ready: true,
  on: true,
  pausedBySupport: false,
  numbers,
});

const twoNumbers = setupWith([aNumber(first, "Sales 1", true), aNumber(second, "Sales 2", true)]);

function show(setup: unknown, answers: Record<string, { data: unknown }> = {}) {
  const api = recordingApi({ "ai.agentSetup": { data: setup }, ...answers });
  const view = renderWithApi(
    <>
      <AgentStateBadge />
      <NumberSwitches />
    </>,
    newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never }),
    member({ isOwner: true }),
  );
  return { api, view };
}

beforeEach(() => {
  screenIs("wide");
});

describe("the AI's switch on each number", () => {
  it("shows a switch per number only when the agency has two", async () => {
    const { view } = show(setupWith([aNumber(first, "Sales 1", true), aNumber(second, "Sales 2", false)]));
    expect(await screen.findByRole("heading", { name: t.title })).toBeVisible();
    expect(screen.getByRole("switch", { name: salesOne })).toBeChecked();
    expect(screen.getByRole("switch", { name: salesTwo })).not.toBeChecked();
    view.unmount();

    show(setupWith([aNumber(first, "Sales 1", true)]));
    // The setup has loaded: the agent's state says so.
    expect(await screen.findByText(messages.aiAgent.state.on)).toBeVisible();
    expect(screen.queryByRole("heading", { name: t.title })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("shows the switch of a lone number switched off, so it can be turned back on", async () => {
    show(setupWith([aNumber(first, "Sales 1", false)]));
    expect(await screen.findByRole("switch", { name: salesOne })).not.toBeChecked();
  });

  it("names two numbers with one label apart by their numbers", async () => {
    show(setupWith([aNumber(first, "WhatsApp", true), aNumber(second, "WhatsApp", true)]));
    expect(await screen.findByRole("switch", { name: "WhatsApp (+91 98765 00001)" })).toBeVisible();
    expect(screen.getByRole("switch", { name: "WhatsApp (+91 98765 00002)" })).toBeVisible();
  });

  it("turns one number's AI off", async () => {
    const { api } = show(twoNumbers, {
      "ai.setNumberAnswers": {
        data: setupWith([aNumber(first, "Sales 1", true), aNumber(second, "Sales 2", false)]),
      },
    });
    await userEvent.click(await screen.findByRole("switch", { name: salesTwo }));
    await waitFor(() => {
      expect(api.sent("ai.setNumberAnswers")).toEqual([{ connectionId: second, on: false }]);
    });
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: salesTwo })).not.toBeChecked();
    });
    expect(screen.getByRole("switch", { name: salesOne })).toBeChecked();
  });
});
