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

const since = "2026-11-12T04:30:00.000Z";

function show(
  state: { on: boolean; missing: string[]; answering: boolean },
  staff = platformStaff("super-admin"),
  pause: { agency: { since: string } | null; everyone: { since: string } | null } = { agency: null, everyone: null },
) {
  stubApi({ "platform.aiAgent.agentState": { data: state }, "platform.aiAgent.organizationPause": { data: pause } });
  renderConsole(<OrganizationAgentState organizationId={organizationId} />, staff);
}

describe("OrganizationAgentState", () => {
  it("says the agent is on, its setup finished, and ready to answer", async () => {
    show({ on: true, missing: [], answering: true });
    expect(await screen.findByText(text.on)).toBeVisible();
    expect(screen.getByText(text.ready)).toBeVisible();
    expect(screen.getByText(text.answering)).toBeVisible();
  });

  it.each([
    ["its own pause", { agency: { since }, everyone: null }],
    ["the pause for every agency", { agency: null, everyone: { since } }],
  ])("says Paused, not ready to answer, under %s", async (_name, pause) => {
    show({ on: true, missing: [], answering: true }, platformStaff("super-admin"), pause);
    expect(await screen.findByText(text.paused)).toBeVisible();
    expect(screen.queryByText(text.answering)).toBeNull();
  });

  it("names the steps still missing, in order", async () => {
    show({ on: true, missing: ["payment", "answers"], answering: false });
    expect(
      await screen.findByText("Its setup isn't finished: payment QR and answers to the fixed questions."),
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
