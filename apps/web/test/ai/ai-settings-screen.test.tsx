// Settings, AI is a small page of switches with a way to the AI agent page: none of the earlier agents' sections
// (knowledge stays, because package drafts are written from the documents it holds).
import type { AiSettings } from "@travel-crm/contracts/ai";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AiSettingsScreen } from "@/ai/ai-settings-screen";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";

const saved: AiSettings = {
  enabled: true,
  scoring: true,
  fillLeads: true,
  writeStyle: "warm",
  providerReady: true,
  monthlyLimit: 8000,
  usedThisMonth: 12,
};
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
const words = messages.ai.settings;

beforeEach(() => {
  screenIs("wide");
});

describe("Settings, AI", () => {
  it("holds the switches and a way to the AI agent page", async () => {
    stubApi({ "ai.settings": { data: saved }, "ai.knowledge": { data: [] } });
    renderWithApi(<AiSettingsScreen />, client());
    expect(await screen.findByRole("heading", { name: words.title })).toBeVisible();
    expect(await screen.findByRole("switch", { name: words.on })).toBeChecked();
    expect(screen.getByRole("switch", { name: words.scoring })).toBeVisible();
    expect(screen.getByRole("switch", { name: words.fillLeads })).toBeVisible();
    expect(screen.getByRole("link", { name: words.openAgent })).toHaveAttribute("href", routes.aiAgent);
  });

  it("has no instructions box", async () => {
    stubApi({ "ai.settings": { data: saved }, "ai.knowledge": { data: [] } });
    renderWithApi(<AiSettingsScreen />, client());
    await screen.findByRole("switch", { name: words.on });
    expect(screen.queryByRole("textbox", { name: /instructions/i })).toBeNull();
    expect(screen.queryByText(/What the AI should know/i)).toBeNull();
  });

  it("has none of the earlier agents' sections or switches", async () => {
    stubApi({ "ai.settings": { data: saved }, "ai.knowledge": { data: [] } });
    renderWithApi(<AiSettingsScreen />, client());
    await screen.findByRole("switch", { name: words.on });
    for (const gone of [
      /Autopilot/i,
      /What it learned/i,
      /Media/i,
      /Way of talking/i,
      /Try it/i,
      /plan custom trips/i,
    ]) {
      expect(screen.queryByRole("heading", { name: gone })).toBeNull();
      expect(screen.queryByRole("switch", { name: gone })).toBeNull();
    }
  });
});
