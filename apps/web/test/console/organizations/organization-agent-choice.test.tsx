// The agent's choice on one agency's console page: the current agent and the last replay in words, super admins' change
// behind a confirmation that lists the gate first, support's view without a button, and the dialog held while pending.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationAgentChoice } from "@/console/organizations/organization/organization-agent-choice";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";
import { organizationId } from "./organization-details";

const text = messages.consoleOrganizations.agentChoice;
const replay = { at: "2026-11-15T04:30:00.000Z", chats: 20, passed: 18, failedChecks: { no_price: 2 } };

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(
  choice: { agent: "lite" | "natural"; lastReplay: typeof replay | null; replaying: boolean },
  staff = platformStaff("super-admin"),
) {
  const api = stubApi({
    "platform.aiAgent.agentChoice": { data: choice },
    "platform.aiAgent.chooseAgent": { data: { ...choice, agent: "natural" } },
  });
  renderConsole(<OrganizationAgentChoice organizationId={organizationId} organizationName="Kerala Trails" />, staff);
  return api;
}

describe("OrganizationAgentChoice", () => {
  it("shows the agency's agent and the last replay", async () => {
    show({ agent: "lite", lastReplay: replay, replaying: false });
    expect(await screen.findByText(text.agents.lite)).toBeVisible();
    expect(screen.getByText(/^18 of 20 chats passed/)).toBeVisible();
  });

  it("lets a super admin change it after confirming, and lists the gate first", async () => {
    show({ agent: "lite", lastReplay: null, replaying: false });
    await userEvent.click(await screen.findByRole("button", { name: text.change }));
    expect(await screen.findByText(text.dialog.steps.bench)).toBeVisible();
    expect(screen.getByText(text.dialog.steps.replay)).toBeVisible();
    expect(screen.getByText(text.dialog.steps.tryIt)).toBeVisible();
    expect(inputsTo("aiAgent.chooseAgent")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: text.dialog.confirm }));
    await waitFor(() => {
      expect(inputsTo("aiAgent.chooseAgent")).toEqual([{ organizationId, agent: "natural" }]);
    });
  });

  it("shows support no button", async () => {
    show({ agent: "natural", lastReplay: null, replaying: false }, platformStaff("support"));
    expect(await screen.findByText(text.agents.natural)).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("holds the dialog while the change is pending", async () => {
    const held = heldAnswer({ data: { agent: "natural", lastReplay: null, replaying: false } });
    const api = show({ agent: "lite", lastReplay: null, replaying: false });
    api.answer("platform.aiAgent.chooseAgent", held.answer);
    await userEvent.click(await screen.findByRole("button", { name: text.change }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: text.dialog.confirm }));
    await waitFor(() => {
      expect(inputsTo("aiAgent.chooseAgent")).toHaveLength(1);
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    held.release();
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
  });
});
