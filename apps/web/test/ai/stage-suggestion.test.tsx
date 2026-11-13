// The AI's suggestion to mark a lead Lost or Not a lead, on the lead's page: the alert says what and why; "Yes" and "No"
// send the person's choice, and are disabled while it is sent; a member who may not edit the lead sees the alert alone.
import type { StageSuggestion } from "@travel-crm/contracts/ai";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageSuggestionAlert } from "@/ai/stage-suggestion";
import { newQueryClient, fakeApi, renderWithApi } from "../organization/api";
import { member } from "../support/members";

const leadId = "0199e7a0-0000-7000-8000-0000000000a1";
const suggestion: StageSuggestion = {
  id: "0199e7a0-0000-7000-8000-0000000000e1",
  leadId,
  name: "Rahul",
  kind: "lost",
  lostReason: "other",
  reason: "Said they're not interested.",
  createdAt: "2026-11-12T08:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

async function show(permissions?: string[], shown: StageSuggestion | null = suggestion) {
  const api = fakeApi();
  renderWithApi(
    <StageSuggestionAlert leadId={leadId} />,
    newQueryClient(),
    permissions === undefined ? member({ isOwner: true }) : member({ permissions }),
  );
  await waitFor(() => {
    expect(api.calls.some((call) => call.path === "ai.leadStageSuggestion")).toBe(true);
  });
  api.calls.find((call) => call.path === "ai.leadStageSuggestion")?.answer({ suggestion: shown });
  return api;
}

describe("StageSuggestionAlert", () => {
  it("says what the AI suggests and why", async () => {
    await show();
    expect(await screen.findByText("The AI suggests marking this lead Lost")).toBeVisible();
    expect(screen.getByText("Said they're not interested.")).toBeVisible();
  });

  it("names Not a lead for that kind", async () => {
    await show(undefined, { ...suggestion, kind: "not_a_lead", lostReason: null, reason: "Looks fake: spam" });
    expect(await screen.findByText("The AI suggests marking this lead Not a lead")).toBeVisible();
    expect(screen.getByRole("button", { name: "Yes, mark it Not a lead" })).toBeVisible();
  });

  it("sends yes with the suggestion's id and is disabled while it is sent", async () => {
    const api = await show();
    const yes = await screen.findByRole("button", { name: "Yes, mark it Lost" });
    await userEvent.click(yes);
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "ai.decideStageSuggestion")).toBe(true);
    });
    const sent = api.calls.find((call) => call.path === "ai.decideStageSuggestion");
    expect(sent?.input).toEqual({ suggestionId: suggestion.id, accept: true });
    expect(yes).toBeDisabled();
    expect(screen.getByRole("button", { name: "No" })).toBeDisabled();
  });

  it("sends no as a decline", async () => {
    const api = await show();
    await userEvent.click(await screen.findByRole("button", { name: "No" }));
    await waitFor(() => {
      expect(api.calls.find((call) => call.path === "ai.decideStageSuggestion")?.input).toEqual({
        suggestionId: suggestion.id,
        accept: false,
      });
    });
  });

  it("shows no buttons to a member without leads:edit", async () => {
    await show(["leads:view"]);
    expect(await screen.findByText("The AI suggests marking this lead Lost")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Yes, mark it Lost" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No" })).toBeNull();
  });

  it("shows nothing when there is no suggestion", async () => {
    await show(undefined, null);
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(screen.queryByText(/The AI suggests/)).toBeNull();
  });
});
