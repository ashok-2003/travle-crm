// The head of the AI screen says "Paused by support", never "Live", while support has the agent paused.
import { brand } from "@travel-crm/brand";
import type { AutopilotSettings } from "@travel-crm/contracts/ai";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AiHero } from "@/ai/ai-hero";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";

const settings = { autopilot: true, agentName: "Riya", pausedBySupport: false } as AutopilotSettings;
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
beforeEach(() => {
  screenIs("wide");
  stubApi({});
});

describe("the AI screen's head", () => {
  it("says Live while the agent answers", () => {
    renderWithApi(<AiHero autopilot={settings} ready />, client());
    expect(screen.getByText(messages.ai.hero.live)).toBeInTheDocument();
    expect(screen.queryByText(messages.ai.hero.pausedBySupport)).not.toBeInTheDocument();
  });

  it("says Paused by support, not Live, while support has it paused", () => {
    renderWithApi(<AiHero autopilot={{ ...settings, pausedBySupport: true }} ready />, client());
    expect(screen.getByText(messages.ai.hero.pausedBySupport)).toBeInTheDocument();
    expect(screen.queryByText(messages.ai.hero.live)).not.toBeInTheDocument();
    expect(
      screen.getByText(messages.ai.hero.pausedBySupportLine.replace("{product}", brand.productName)),
    ).toBeInTheDocument();
  });
});
