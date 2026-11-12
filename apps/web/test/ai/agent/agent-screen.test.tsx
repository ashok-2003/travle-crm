// The AI agent page's tabs: all three exist, ?tab=try shows the test box, an unknown tab opens Overview.
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentScreen } from "@/ai/agent/agent-screen";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../../organization/api";
import { screenIs } from "../../organization/render";
import { stubApi } from "../../support/api-stub";
import { address } from "../../leads/navigation";

vi.mock("next/navigation", () => import("../../leads/navigation"));

const t = messages.aiAgent;
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });

beforeEach(() => {
  screenIs("wide");
  stubApi({
    "ai.agentSetup": { data: { steps: [], ready: false, on: false, pausedBySupport: false } },
    "ai.handedOver": { data: [] },
    "ai.overview": {
      data: {
        chatsAnswered: 0,
        messagesSent: 0,
        medianReplySeconds: null,
        flagged: 0,
        followUpsPlanned: 0,
        learnings: 0,
        model: null,
      },
    },
    "paymentsToCheck.count": { data: { count: 0 } },
  });
});

async function open(href: string) {
  address.set(href);
  renderWithApi(<AgentScreen />, client());
  await screen.findByRole("tab", { name: t.tabs.overview });
}

describe("the AI agent page's tabs", () => {
  it("has Overview, Setup and Try it", async () => {
    await open("/ai-agent");
    for (const name of [t.tabs.overview, t.tabs.setup, t.tabs.try]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("opens Try it with the test box from ?tab=try", async () => {
    await open("/ai-agent?tab=try");
    expect(screen.getByRole("tab", { name: t.tabs.try, selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText(messages.ai.test.question)).toBeVisible();
  });

  it("falls back to Overview for an unknown tab", async () => {
    await open("/ai-agent?tab=nonsense");
    expect(screen.getByRole("tab", { name: t.tabs.overview, selected: true })).toBeInTheDocument();
    expect(screen.queryByLabelText(messages.ai.test.question)).not.toBeInTheDocument();
  });
});
