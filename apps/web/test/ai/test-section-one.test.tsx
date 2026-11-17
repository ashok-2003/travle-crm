// Try it on the one agent: the Agent choice sends its turns to ai.testOne with natural's state and the chat's id, with no
// prompt choice offered or sent, and shows its answer as the new agent's.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { TestSection } from "@/ai/test-section";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const words = messages.ai.test;
const { choices } = words;
beforeEach(() => {
  screenIs("wide");
  // Radix's Select reaches for pointer capture and scrolling, which jsdom lacks.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

const state = {
  facts: {
    agent: "natural",
    leadId: null,
    sentTripIds: [],
    sentFileIds: [],
    offer: null,
    told: [],
    bookingId: null,
    lastTurnAt: "2026-11-16T10:01:00.000Z",
  },
  lead: {
    packageId: null,
    day: null,
    month: null,
    adults: null,
    childrenAges: [],
    pickupCity: null,
    room: null,
    name: null,
    stage: "new",
    notes: [],
    tasks: [],
    booking: null,
  },
};
const reply = "Yes! It departs every Saturday in December.";
const answer = {
  messages: [reply],
  payment: null,
  actions: [],
  outcome: "replied",
  state,
  history: [{ from: "agent", text: reply }],
  trace: {
    agent: "one",
    promptVersion: "langfuse:whatsapp-agent/real-agent@3",
    promptLabel: "latest",
    outcome: "replied",
    fallback: null,
    restarted: null,
    durationMs: 900,
    calls: [],
    guards: [],
    staged: [],
    flags: [],
  },
};

describe("Try it on the one agent", () => {
  it("sends the one agent's turns to ai.testOne without a prompt choice, and shows its answer", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never }));
    await userEvent.click(screen.getByRole("combobox", { name: choices.agent }));
    await userEvent.click(await screen.findByRole("option", { name: choices.agents.one }));
    expect(screen.queryByRole("combobox", { name: choices.prompt })).toBeNull();
    await userEvent.type(screen.getByLabelText(words.message), "Kedarkantha in Dec?");
    await userEvent.click(screen.getByRole("button", { name: words.send }));
    expect(api.last().path).toBe("ai.testOne");
    expect(api.last().input).toEqual({
      messages: [{ from: "customer", text: "Kedarkantha in Dec?" }],
      state: null,
      model: "live",
      temperature: "default",
      chatId: expect.any(String) as unknown,
    });
    api.last().answer(answer);
    expect(await screen.findByText(reply)).toBeVisible();
    await userEvent.type(screen.getByLabelText(words.message), "12 Dec for 2");
    await userEvent.click(screen.getByRole("button", { name: words.send }));
    expect(api.last().path).toBe("ai.testOne");
    expect(api.last().input).toMatchObject({ state });
  });
});
