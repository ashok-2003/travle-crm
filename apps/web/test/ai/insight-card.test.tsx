// The AI's guess on the lead page wears the AI chip and, when the lite agent has written notes from the chat, shows them
// under "What the AI noted"; with no notes there is no such heading.
import type { LeadInsight } from "@travel-crm/contracts/ai";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InsightCard } from "@/ai/insight-card";
import { messages } from "@/i18n/messages";
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

describe("InsightCard", () => {
  it("shows the AI chip and what the AI noted", () => {
    stubApi({});
    renderScreen(
      <InsightCard insight={{ ...insight, chatSummary: "Travels with her parents; likes quiet places." }} />,
    );
    expect(document.querySelector("[data-ai-chip]")).toHaveTextContent(messages.ai.chip);
    expect(screen.getByRole("heading", { name: messages.ai.insight.noted })).toBeVisible();
    expect(screen.getByText("Travels with her parents; likes quiet places.")).toBeVisible();
  });

  it("shows nothing under 'What the AI noted' when there is no summary", () => {
    stubApi({});
    renderScreen(<InsightCard insight={insight} />);
    expect(document.querySelector("[data-ai-chip]")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: messages.ai.insight.noted })).not.toBeInTheDocument();
  });

  it("shows the chip, the guess, the reasons and the next step, without a chance bar or a facts table", () => {
    stubApi({});
    renderScreen(<InsightCard insight={insight} />);
    expect(document.querySelector("[data-ai-chip]")).toHaveTextContent(messages.ai.chip);
    expect(screen.getByText(/72%/)).toBeVisible();
    expect(screen.getByText(messages.ai.insight.labels.hot, { exact: false })).toBeVisible();
    expect(screen.getByText("Gave dates")).toBeVisible();
    expect(screen.getByText("Call today.")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // Only the title, the next step and the reasons are headed: no row of the trip's facts is left.
    expect(screen.getAllByRole("heading").map((one) => one.textContent)).toEqual([
      messages.ai.insight.title,
      messages.ai.insight.nextStep,
      messages.ai.insight.why,
    ]);
  });

  it("still shows the alert and its reason for a lead that looks fake", () => {
    stubApi({});
    renderScreen(<InsightCard insight={{ ...insight, fake: true, fakeReason: "A test message." }} />);
    expect(screen.getByText(messages.ai.insight.fakeTitle)).toBeVisible();
    expect(screen.getByText("A test message.")).toBeVisible();
  });
});
