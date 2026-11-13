// An agency's AI agent setup on its console page: each state in words, and plan 4's link to the AI's turns for super
// admins only.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationAgentState } from "@/console/organizations/organization/organization-agent-state";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { renderConsole } from "../../support/render-console";
import { organizationId } from "./organization-details";

const text = messages.consoleWhatsapp.agentState;

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(state: { on: boolean; missing: string[]; answering: boolean }, staff = platformStaff("super-admin")) {
  stubApi({ "platform.aiAgent.agentState": { data: state } });
  renderConsole(<OrganizationAgentState organizationId={organizationId} />, staff);
}

describe("OrganizationAgentState", () => {
  it("says the agent is on, its setup finished, and ready to answer", async () => {
    show({ on: true, missing: [], answering: true });
    expect(await screen.findByText(text.on)).toBeVisible();
    expect(screen.getByText(text.ready)).toBeVisible();
    expect(screen.getByText(text.answering)).toBeVisible();
  });

  it("names the steps still missing, in order", async () => {
    show({ on: true, missing: ["payment", "answers"], answering: false });
    expect(
      await screen.findByText("Its setup isn't finished: payment details and answers to the fixed questions."),
    ).toBeVisible();
    expect(screen.getByText(text.notAnswering)).toBeVisible();
  });

  it("says the agent is off", async () => {
    show({ on: false, missing: [], answering: false });
    expect(await screen.findByText(text.off)).toBeVisible();
  });

  it("leads a super admin to the AI's turns", async () => {
    show({ on: true, missing: [], answering: true });
    expect(await screen.findByRole("link", { name: messages.consoleAi.traces.link })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces`,
    );
  });

  it("shows support the state and no link to the AI's turns", async () => {
    show({ on: true, missing: [], answering: true }, platformStaff("support"));
    await screen.findByText(text.on);
    expect(screen.queryByRole("link", { name: messages.consoleAi.traces.link })).toBeNull();
  });
});
