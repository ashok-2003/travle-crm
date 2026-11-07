// The switch that answers from the packages only, the warning under free-text editors that hold a price or a date, and the
// media section that stops asking when to send a file for an agency on the switch.
import type { AutopilotSettings } from "@travel-crm/contracts/ai";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SettingsForm } from "@/ai/ai-settings-screen";
import { AutopilotSection } from "@/ai/autopilot-section";
import { MediaSection } from "@/ai/media-section";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";

const saved: AutopilotSettings = {
  autopilot: true,
  grounded: false,
  agentName: "Riya",
  followUpHours: 4,
  maxRepliesPerDay: 25,
  language: "customer",
  languageOther: "",
  style: "human",
  emojis: "few",
  tone: "friendly",
  handoff: "alert",
  smartFollowUp: true,
  learning: false,
  persona: "sales",
  leadNotes: true,
  sendMedia: true,
  paymentDetails: "",
  strictRules: "",
  followUpTasks: true,
  learnedAt: null,
  voice: null,
};
const file = {
  id: "0199a000-0000-7000-8000-0000000000aa",
  title: "Brochure",
  whenToSend: "When they ask about Spiti",
  fileName: "brochure.pdf",
  contentType: "application/pdf",
  ready: true,
  enabled: true,
  sent: 0,
  updatedAt: "2026-11-01T05:00:00.000Z",
};
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
const warning = messages.ai.amountsAndDates;
beforeEach(() => {
  screenIs("wide");
});

describe("the switch to answer from packages only", () => {
  it("shows the refusal when the agency has no package the AI may sell", async () => {
    const api = stubApi({ "ai.saveAutopilot": { status: 400, reason: "NO_SELLABLE_PACKAGES" } });
    renderWithApi(<AutopilotSection saved={saved} aiOn />, client());
    const grounded = screen.getByRole("switch", { name: messages.ai.autopilot.grounded });
    expect(grounded).not.toBeChecked();
    await userEvent.click(grounded);
    await userEvent.click(screen.getByRole("button", { name: messages.ai.autopilot.save }));
    expect(
      await screen.findByText("Make at least one package with a destination sellable by the AI first."),
    ).toBeVisible();
    expect(api.calls).toContain("ai.saveAutopilot");
  });
});

describe("the editors that hold prices", () => {
  it("warn about a price in Strict rules, and say nothing about a plain rule", async () => {
    stubApi({ "ai.autopilot": { data: { ...saved, grounded: true } } });
    renderWithApi(<AutopilotSection saved={{ ...saved, grounded: true }} aiOn />, client());
    const rules = screen.getByLabelText(messages.ai.payments.rules);
    await userEvent.type(rules, "Never go below Rs 5,000 a head");
    expect(await screen.findByText(warning)).toBeVisible();
    await userEvent.clear(rules);
    await userEvent.type(rules, "Always greet by name");
    await waitFor(() => {
      expect(screen.queryByText(warning)).toBeNull();
    });
  });

  it("say nothing to an agency on the old agent, which still reads its prices there", async () => {
    stubApi({ "ai.autopilot": { data: saved } });
    renderWithApi(<AutopilotSection saved={saved} aiOn />, client());
    await userEvent.type(screen.getByLabelText(messages.ai.payments.rules), "Never go below Rs 5,000 a head");
    // Let the switch's own read settle before judging the absence.
    await waitFor(() => {
      expect(screen.getByLabelText(messages.ai.payments.rules)).toHaveValue("Never go below Rs 5,000 a head");
    });
    expect(screen.queryByText(warning)).toBeNull();
  });

  it("warn about a date in Instructions", async () => {
    stubApi({ "ai.autopilot": { data: { ...saved, grounded: true } } });
    renderWithApi(
      <SettingsForm
        saved={{
          enabled: true,
          scoring: true,
          fillLeads: true,
          customTrips: false,
          writeStyle: "warm",
          instructions: "Spiti batch leaves on 14 Nov 2026",
          providerReady: true,
          monthlyLimit: 8000,
          usedThisMonth: 0,
        }}
      />,
      client(),
    );
    expect(await screen.findByText(warning)).toBeVisible();
  });
});

describe("files about the agency", () => {
  it("general files hide when to send, for an agency that answers from its packages", async () => {
    stubApi({ "ai.media": { data: [file] }, "ai.autopilot": { data: { ...saved, grounded: true } } });
    renderWithApi(<MediaSection />, client());
    expect(await screen.findByRole("heading", { name: messages.ai.media.groundedTitle })).toBeVisible();
    expect(await screen.findByText("Brochure")).toBeVisible();
    expect(screen.queryByText(/When they ask about Spiti/)).toBeNull();
  });

  it("keep the title and when to send for any other agency", async () => {
    stubApi({ "ai.media": { data: [file] }, "ai.autopilot": { data: saved } });
    renderWithApi(<MediaSection />, client());
    expect(await screen.findByText(/When they ask about Spiti/)).toBeVisible();
    expect(screen.getByRole("heading", { name: messages.ai.media.title })).toBeVisible();
  });
});
