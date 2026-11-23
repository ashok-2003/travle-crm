// The AI agent page's switch for each WhatsApp number (spec 2026-11-22 section 8): one switch per live number, shown once
// the agency has two, each sending its own number's id; the setup that comes back is what the page shows.
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

const setupWith = (numbers: { id: string; label: string; aiAnswers: boolean }[]) => ({
  steps: [],
  ready: true,
  on: true,
  pausedBySupport: false,
  numbers,
});

const twoNumbers = setupWith([
  { id: first, label: "Sales 1", aiAnswers: true },
  { id: second, label: "Sales 2", aiAnswers: true },
]);

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
    const { view } = show(
      setupWith([
        { id: first, label: "Sales 1", aiAnswers: true },
        { id: second, label: "Sales 2", aiAnswers: false },
      ]),
    );
    expect(await screen.findByRole("heading", { name: t.title })).toBeVisible();
    expect(screen.getByRole("switch", { name: "Sales 1" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Sales 2" })).not.toBeChecked();
    view.unmount();

    show(setupWith([{ id: first, label: "Sales 1", aiAnswers: true }]));
    // The setup has loaded: the agent's state says so.
    expect(await screen.findByText(messages.aiAgent.state.on)).toBeVisible();
    expect(screen.queryByRole("heading", { name: t.title })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("turns one number's AI off", async () => {
    const { api } = show(twoNumbers, {
      "ai.setNumberAnswers": {
        data: setupWith([
          { id: first, label: "Sales 1", aiAnswers: true },
          { id: second, label: "Sales 2", aiAnswers: false },
        ]),
      },
    });
    await userEvent.click(await screen.findByRole("switch", { name: "Sales 2" }));
    await waitFor(() => {
      expect(api.sent("ai.setNumberAnswers")).toEqual([{ connectionId: second, on: false }]);
    });
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Sales 2" })).not.toBeChecked();
    });
    expect(screen.getByRole("switch", { name: "Sales 1" })).toBeChecked();
  });
});
