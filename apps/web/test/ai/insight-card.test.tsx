// The AI's guess on the lead page: the AI's violet card with its chip; when the lite agent has written notes from the chat,
// them under "What the AI noted" (three lines, then More); the next step; and Why, folded until opened (the lead page's
// revamp, 2026-11-21). LeadTemperature is the guess alone, "Warm 65%", for the lead's header.
import type { LeadInsight } from "@travel-crm/contracts/ai";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsightCard, LeadTemperature } from "@/ai/insight-card";
import { messages } from "@/i18n/messages";
import { paidSubscription } from "../organization/api";
import { renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";

const insight: LeadInsight = {
  score: 72,
  label: "hot",
  reasons: ["Gave dates"],
  fake: false,
  fakeReason: null,
  summary: "Wants Manali.",
  nextStep: "Call today.",
  chatSummary: null,
  updatedAt: "2026-11-12T08:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InsightCard", () => {
  it("shows the AI chip, and what the AI noted under Why, folded until opened", async () => {
    stubApi({});
    renderScreen(
      <InsightCard insight={{ ...insight, chatSummary: "Travels with her parents; likes quiet places." }} />,
    );
    expect(document.querySelector("[data-ai-chip]")).toHaveTextContent(messages.ai.chip);
    expect(screen.queryByText("Travels with her parents; likes quiet places.")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: messages.ai.insight.why }));
    expect(screen.getByRole("heading", { name: messages.ai.insight.noted })).toBeVisible();
    expect(screen.getByText("Travels with her parents; likes quiet places.")).toBeVisible();
  });

  it("shows nothing under 'What the AI noted' when there is no summary", async () => {
    stubApi({});
    renderScreen(<InsightCard insight={insight} />);
    expect(document.querySelector("[data-ai-chip]")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: messages.ai.insight.why }));
    expect(screen.queryByRole("heading", { name: messages.ai.insight.noted })).not.toBeInTheDocument();
  });

  it("shows the chip, the guess, the next step and Why folded, in the AI's violet, without a chance bar or a facts table", async () => {
    stubApi({});
    renderScreen(<InsightCard insight={insight} />);
    expect(document.querySelector("[data-ai-chip]")).toHaveTextContent(messages.ai.chip);
    expect(document.querySelector("[data-temperature]")).toHaveTextContent("Hot 72%");
    expect(screen.getByText("Call today.")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: messages.ai.insight.title }).className).toContain("--brand-people-tint");
    // Only the title, the next step and Why are headed: no row of the trip's facts is left.
    expect(screen.getAllByRole("heading").map((one) => one.textContent)).toEqual([
      messages.ai.insight.title,
      messages.ai.insight.nextStep,
      messages.ai.insight.why,
    ]);
    // Why is folded until opened.
    const why = screen.getByRole("button", { name: messages.ai.insight.why });
    expect(why).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Gave dates")).not.toBeInTheDocument();
    await userEvent.click(why);
    expect(why).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Gave dates")).toBeVisible();
  });

  it("cuts a long note to three lines with More, which opens the rest", async () => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(120);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(66);
    stubApi({});
    renderScreen(<InsightCard insight={{ ...insight, chatSummary: "A long note.\nOn many lines.\nAnd more." }} />);
    await userEvent.click(screen.getByRole("button", { name: messages.ai.insight.why }));
    const note = screen.getByText(/A long note\./);
    expect(note).toHaveClass("line-clamp-3");
    await userEvent.click(screen.getByRole("button", { name: messages.common.readMore }));
    expect(note).not.toHaveClass("line-clamp-3");
    expect(screen.getByRole("button", { name: messages.common.readLess })).toHaveAttribute("aria-expanded", "true");
  });

  it("still shows the alert and its reason for a lead that looks fake", () => {
    stubApi({});
    renderScreen(<InsightCard insight={{ ...insight, fake: true, fakeReason: "A test message." }} />);
    expect(screen.getByText(messages.ai.insight.fakeTitle)).toBeVisible();
    expect(screen.getByText("A test message.")).toBeVisible();
  });
});

describe("LeadTemperature", () => {
  const show = (shown: LeadInsight | null) => {
    stubApi({ "ai.leadInsight": { data: { insight: shown } } });
    renderScreen(<LeadTemperature leadId="0199e7a0-0000-7000-8000-000000000a01" />, {
      subscription: { ...paidSubscription, modules: ["ai"] },
    });
  };

  it("says the AI's guess as 'Warm 65%' in its violet, named as the AI's guess", async () => {
    show({ ...insight, label: "warm", score: 65 });
    const chip = await screen.findByText((_, element) => element?.hasAttribute("data-temperature") === true);
    expect(chip).toHaveTextContent(`${messages.ai.insight.title}: Warm 65%`);
    expect(chip).toHaveClass("bg-people-tint", "text-people-tint-ink");
  });

  it("says 'Looks fake' for a lead that looks fake, and nothing before the AI has scored the lead", async () => {
    show({ ...insight, fake: true });
    expect(await screen.findByText(messages.ai.insight.fake)).toBeVisible();
  });

  it("shows nothing before the AI has scored the lead", async () => {
    show(null);
    await waitFor(() => {
      expect(document.querySelector("[data-temperature]")).toBeNull();
    });
  });
});
