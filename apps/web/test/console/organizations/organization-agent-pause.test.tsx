// The AI agent's switch on one agency's console page: running, paused for the agency, paused for everyone, or both;
// the buttons for super admins only; and the confirmation that sends the pause or the resume for this agency.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationAgentPause } from "@/console/organizations/organization/organization-agent-pause";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";
import { organizationId } from "./organization-details";

const text = messages.consoleWhatsapp.agentPause.agency;
const since = "2026-11-12T04:30:00.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(
  pause: { agency: { since: string } | null; everyone: { since: string } | null },
  staff = platformStaff("super-admin"),
) {
  const api = stubApi({
    "platform.aiAgent.organizationPause": { data: pause },
    "platform.aiAgent.pauseOrganization": { data: { agency: null, everyone: null } },
  });
  renderConsole(<OrganizationAgentPause organizationId={organizationId} organizationName="Kerala Trails" />, staff);
  return api;
}

describe("OrganizationAgentPause", () => {
  it("says running when nothing is paused", async () => {
    show({ agency: null, everyone: null });
    expect(await screen.findByText(text.running)).toBeVisible();
    expect(screen.getByRole("button", { name: text.pause })).toBeVisible();
  });

  it("says the agency is paused and offers the resume", async () => {
    show({ agency: { since }, everyone: null });
    expect(await screen.findByText(/^Paused for this agency since /)).toBeVisible();
    expect(screen.getByRole("button", { name: text.resume })).toBeVisible();
  });

  it("says the pause for every agency, with the agency's own when both apply", async () => {
    show({ agency: { since }, everyone: { since } });
    expect(await screen.findByText(/^Paused for this agency since /)).toBeVisible();
    expect(screen.getByText(/^Paused for every agency since /)).toBeVisible();
  });

  it("shows support the state and no button", async () => {
    show({ agency: null, everyone: null }, platformStaff("support"));
    await screen.findByText(text.running);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("pauses this agency on confirming, and keeps Cancel off while the request is out", async () => {
    const held = heldAnswer({ data: { agency: { since }, everyone: null } });
    const api = show({ agency: null, everyone: null });
    api.answer("platform.aiAgent.pauseOrganization", held.answer);
    await userEvent.click(await screen.findByRole("button", { name: text.pause }));
    expect(await screen.findByText("Pause the AI agent for Kerala Trails?")).toBeVisible();
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: text.pauseDialog.confirm }));
    await waitFor(() => {
      expect(inputsTo("aiAgent.pauseOrganization")).toEqual([{ organizationId, paused: true }]);
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    held.release();
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
  });

  it("resumes with paused false", async () => {
    show({ agency: { since }, everyone: null });
    await userEvent.click(await screen.findByRole("button", { name: text.resume }));
    await userEvent.click(await screen.findByRole("button", { name: text.resumeDialog.confirm }));
    await waitFor(() => {
      expect(inputsTo("aiAgent.pauseOrganization")).toEqual([{ organizationId, paused: false }]);
    });
  });

  it("tells that the pause for every agency outlasts this agency's resume", async () => {
    show({ agency: { since }, everyone: { since } });
    await userEvent.click(await screen.findByRole("button", { name: text.resume }));
    expect(await screen.findByText(text.resumeDialog.descriptionWhileEveryonePaused)).toBeVisible();
    expect(screen.queryByText(text.resumeDialog.description.replace("{name}", "Kerala Trails"))).toBeNull();
  });
});
