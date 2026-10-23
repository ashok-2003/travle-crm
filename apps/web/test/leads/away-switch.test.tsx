// The away switch (release 4): for someone in the pool that takes new leads in turn, away for a day, three or seven, or
// back at once, with when they return; nothing for anyone else; off while the subscription is read-only.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AwaySwitch } from "@/leads/away-switch";
import { messages } from "@/i18n/messages";
import { paidSubscription } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { inputsTo, renderScreen, salesperson } from "./screen";

vi.mock("@travel-crm/contracts/features", () => ({ features: { automaticAssignment: true } }));

const words = messages.leads.away;
const NOW = new Date("2026-10-23T05:30:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderAway(place: object, options: Parameters<typeof renderScreen>[1] = {}) {
  const api = stubApi({ "assignment.mine": { data: place }, "assignment.setAway": { data: null } });
  renderScreen(<AwaySwitch />, { me: salesperson, ...options });
  return api;
}

describe("AwaySwitch", () => {
  it("offers a day, three or seven to someone in the pool, and sends the time they return", async () => {
    renderAway({ inPool: true, awayUntil: null });
    await userEvent.click(await screen.findByRole("button", { name: "Away for 3 days" }));
    await waitFor(() => {
      expect(inputsTo("assignment.setAway")).toHaveLength(1);
    });
    expect(inputsTo("assignment.setAway")[0]).toEqual({ awayUntil: "2026-10-26T05:30:00.000Z" });
  });

  it("says when they are back and offers I'm back", async () => {
    renderAway({ inPool: true, awayUntil: "2026-10-26T05:30:00.000Z" });
    expect(await screen.findByText(/You're away until 26 Oct/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.back }));
    await waitFor(() => {
      expect(inputsTo("assignment.setAway")).toEqual([{ awayUntil: null }]);
    });
  });

  it("shows nothing to someone outside the pool", async () => {
    const api = renderAway({ inPool: false, awayUntil: null });
    await waitFor(() => {
      expect(api.calls).toContain("assignment.mine");
    });
    expect(screen.queryByText(words.title)).not.toBeInTheDocument();
  });

  it("turns the buttons off while the subscription is read-only, saying why", async () => {
    renderAway({ inPool: true, awayUntil: null }, { subscription: { ...paidSubscription, access: "read_only" } });
    const button = await screen.findByRole("button", { name: "Away for a day" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
  });
});
