// Which agent answers, on one agency's console page: each state in words, the button for super admins only, and the
// confirmation that sends the switch for this agency.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationLiteAgent } from "@/console/organizations/organization/organization-lite-agent";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";
import { organizationId } from "./organization-details";

const text = messages.consoleWhatsapp.liteAgent;

afterEach(() => {
  vi.unstubAllGlobals();
});

function show(lite: boolean, staff = platformStaff("super-admin"), answering = lite) {
  const api = stubApi({
    "platform.aiAgent.liteAgent": { data: { lite, answering } },
    "platform.aiAgent.setLiteAgent": { data: { lite: !lite, answering: false } },
  });
  renderConsole(<OrganizationLiteAgent organizationId={organizationId} organizationName="Kerala Trails" />, staff);
  return api;
}

describe("OrganizationLiteAgent", () => {
  it("says the earlier agent answers and offers the switch", async () => {
    show(false);
    expect(await screen.findByText(text.off)).toBeVisible();
    expect(screen.getByRole("button", { name: text.switchOn })).toBeVisible();
  });

  it("says the lite agent answers and offers the way back", async () => {
    show(true);
    expect(await screen.findByText(text.on)).toBeVisible();
    expect(screen.getByRole("button", { name: text.switchOff })).toBeVisible();
  });

  it("says when the switch is on but the agency's AI or setup isn't ready, so it doesn't answer yet", async () => {
    show(true, platformStaff("super-admin"), false);
    expect(await screen.findByText(text.waiting)).toBeVisible();
    expect(screen.queryByText(text.on)).toBeNull();
    expect(screen.getByRole("button", { name: text.switchOff })).toBeVisible();
  });

  it("shows support the sentence and no button", async () => {
    show(true, platformStaff("support"));
    await screen.findByText(text.on);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("switches on when confirmed, and keeps Cancel off while the request is out", async () => {
    const held = heldAnswer({ data: { lite: true, answering: true } });
    const api = show(false);
    api.answer("platform.aiAgent.setLiteAgent", held.answer);
    await userEvent.click(await screen.findByRole("button", { name: text.switchOn }));
    expect(await screen.findByText("Switch Kerala Trails to the lite agent?")).toBeVisible();
    const dialog = screen.getByRole("alertdialog");
    await userEvent.click(screen.getByRole("button", { name: text.onDialog.confirm }));
    await waitFor(() => {
      expect(inputsTo("aiAgent.setLiteAgent")).toEqual([{ organizationId, lite: true }]);
    });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    held.release();
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
  });

  it("switches back with lite false", async () => {
    show(true);
    await userEvent.click(await screen.findByRole("button", { name: text.switchOff }));
    await userEvent.click(await screen.findByRole("button", { name: text.offDialog.confirm }));
    await waitFor(() => {
      expect(inputsTo("aiAgent.setLiteAgent")).toEqual([{ organizationId, lite: false }]);
    });
  });

  it("leads a super admin to the AI's turns, and support not", async () => {
    show(true);
    expect(await screen.findByRole("link", { name: messages.consoleAi.traces.link })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/ai-traces`,
    );
  });

  it("shows support no link to the AI's turns", async () => {
    show(true, platformStaff("support"));
    await screen.findByText(text.on);
    expect(screen.queryByRole("link", { name: messages.consoleAi.traces.link })).toBeNull();
  });
});
