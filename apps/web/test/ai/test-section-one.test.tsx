// Try it on the one agent: it sends its turns to ai.testOne with natural's state and the chat's id, with no model,
// temperature or prompt choice, and shows its answer and its offer card.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { TestSection } from "@/ai/test-section";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const words = messages.ai.test;
beforeEach(() => {
  screenIs("wide");
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
    promptLabel: "production",
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
  it("sends the one agent's turns to ai.testOne with no choice, and shows its answer", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, newQueryClient());
    await userEvent.type(screen.getByLabelText(words.message), "Kedarkantha in Dec?");
    await userEvent.click(screen.getByRole("button", { name: words.send }));
    expect(api.last().path).toBe("ai.testOne");
    expect(api.last().input).toEqual({
      messages: [{ from: "customer", text: "Kedarkantha in Dec?" }],
      state: null,
      chatId: expect.any(String) as unknown,
    });
    api.last().answer(answer);
    expect(await screen.findByText(reply)).toBeVisible();
    await userEvent.type(screen.getByLabelText(words.message), "12 Dec for 2");
    await userEvent.click(screen.getByRole("button", { name: words.send }));
    expect(api.last().path).toBe("ai.testOne");
    expect(api.last().input).toMatchObject({ state });
  });

  it("shows the card's buttons and sends a tap", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, newQueryClient());
    await userEvent.type(screen.getByLabelText(words.message), "Kedarkantha 19 Dec, 2 log");
    await userEvent.click(screen.getByRole("button", { name: words.send }));
    const card = { body: "*Kedarkantha*\nTotal ₹18,998", buttons: ["Book these seats", "Change something"] };
    api.last().answer({ ...answer, card });
    expect(await screen.findByText(/Total ₹18,998/u)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Book these seats" }));
    expect(api.last().input).toMatchObject({ tap: "book" });
    expect(api.last().input).toMatchObject({
      messages: expect.arrayContaining([{ from: "customer", text: "Tapped: Book these seats" }]) as unknown,
    });
  });
});
