// The console's switch for the AI agent on every agency: its state in words, the button for super admins only, and the
// confirmation that sends the pause or the resume.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentPauseBlock } from "@/console/whatsapp/agent-pause-block";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";

const text = messages.consoleWhatsapp.agentPause.everyone;
const since = "2026-11-12T04:30:00.000Z";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentPauseBlock", () => {
  it("says the agent is answering when nothing is paused", async () => {
    stubApi({ "platform.aiAgent.pauseState": { data: { everyone: null } } });
    renderConsole(<AgentPauseBlock />);
    expect(await screen.findByText(text.running)).toBeVisible();
    expect(screen.getByRole("button", { name: text.pause })).toBeVisible();
  });

  it("says since when it is paused and offers the resume", async () => {
    stubApi({ "platform.aiAgent.pauseState": { data: { everyone: { since } } } });
    renderConsole(<AgentPauseBlock />);
    expect(await screen.findByText(/^Paused for every agency since .*No AI replies/)).toBeVisible();
    expect(screen.getByRole("button", { name: text.resume })).toBeVisible();
  });

  it("shows support the state and no button", async () => {
    stubApi({ "platform.aiAgent.pauseState": { data: { everyone: null } } });
    renderConsole(<AgentPauseBlock />, platformStaff("support"));
    await screen.findByText(text.running);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("pauses for every agency on confirming, and keeps Cancel off while the request is out", async () => {
    const held = heldAnswer({ data: { everyone: { since } } });
    stubApi({
      "platform.aiAgent.pauseState": { data: { everyone: null } },
      "platform.aiAgent.pauseEveryone": held.answer,
    });
    renderConsole(<AgentPauseBlock />);
    await userEvent.click(await screen.findByRole("button", { name: text.pause }));
    expect(await screen.findByText(text.pauseDialog.title)).toBeVisible();
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: text.pauseDialog.confirm, hidden: false }));
    await waitFor(() => {
      expect(inputsTo("aiAgent.pauseEveryone")).toEqual([{ paused: true }]);
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    held.release();
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
  });

  it("resumes with paused false", async () => {
    stubApi({
      "platform.aiAgent.pauseState": { data: { everyone: { since } } },
      "platform.aiAgent.pauseEveryone": { data: { everyone: null } },
    });
    renderConsole(<AgentPauseBlock />);
    await userEvent.click(await screen.findByRole("button", { name: text.resume }));
    await userEvent.click(await screen.findByRole("button", { name: text.resumeDialog.confirm }));
    await waitFor(() => {
      expect(inputsTo("aiAgent.pauseEveryone")).toEqual([{ paused: false }]);
    });
  });
});
