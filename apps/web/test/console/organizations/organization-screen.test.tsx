// An organization's page in the console: its name, code and status today; after onboarding, that the Owner's invite
// is on its way; its row, profile and members; the way to data protection for super admins only; an organization
// that doesn't exist, or a page that didn't load, said plainly.
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationScreen } from "@/console/organizations/organization/organization-screen";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { organizationDetails, organizationId } from "./organization-details";
import { renderConsole as renderConsoleScreen } from "../../support/render-console";

const { organization } = messages.consoleOrganizations;

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** An organization's WhatsApp group as whatsapp.get gives it, with a number in the given state. */
function group(status: "setup" | "connected") {
  return {
    configured: true,
    cannotConnectReason: null,
    usage: [],
    connection: {
      id: "0199a000-0000-7000-8000-0000000000d1",
      organizationId,
      organizationName: "Kerala Trails",
      displayNumber: "919876543210",
      mode: "shared",
      status,
      connectedAt: null,
      lastEventAt: null,
      webhookSeenAt: null,
      messagesThisMonth: { inbound: 0, outbound: 0, marketing: 0 },
      marketingCapMonth: 1000,
      templateCapDay: 100,
      overFairUse: false,
      cancelledButConnected: false,
      problemSince: null,
      qualityRating: null,
      note: null,
    },
  };
}

describe("OrganizationScreen", () => {
  it("shows the organization's name, code and status today", async () => {
    stubApi({ "platform.organizations.get": { data: organizationDetails() } });
    renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded={false} />);
    const heading = await screen.findByRole("heading", { level: 1, name: "Kerala Trails" });
    expect(heading).toBeVisible();
    expect(heading.nextElementSibling).toHaveTextContent(`KERALA${messages.console.status.active}`);
    expect(screen.queryByText(organization.onboarded)).toBeNull();
    for (const section of [
      messages.consoleOrganizations.record.heading,
      messages.consoleOrganizations.profile.heading,
      messages.consoleOrganizations.members.heading,
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeVisible();
    }
  });

  it("asks for the details, the members and the WhatsApp group in the same render, not one after another", async () => {
    const held = heldAnswer({ data: organizationDetails() });
    const api = stubApi({
      "platform.organizations.get": held.answer,
      "platform.organizations.members": { data: [] },
      "platform.whatsapp.get": { data: group("connected") },
    });
    renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded={false} />);
    // The details are still on their way: the other two have already been asked for.
    await vi.waitFor(() => {
      expect(api.calls).toEqual(expect.arrayContaining(["platform.organizations.members", "platform.whatsapp.get"]));
    });
    expect(api.calls).toContain("platform.organizations.get");
    held.release();
    await screen.findByRole("heading", { level: 1, name: "Kerala Trails" });
    expect(api.calls.filter((call) => call === "platform.whatsapp.get")).toHaveLength(1);
    expect(api.calls.filter((call) => call === "platform.organizations.members")).toHaveLength(1);
  });

  it.each([
    ["connected", 1],
    ["setup", 2],
  ] as const)(
    "looks at the WhatsApp group again only while a number is being connected (%s)",
    async (status, asked) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const api = stubApi({
          "platform.organizations.get": { data: organizationDetails() },
          "platform.organizations.members": { data: [] },
          "platform.whatsapp.get": { data: group(status) },
        });
        renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded={false} />);
        await screen.findByRole("heading", { level: 1, name: "Kerala Trails" });
        await vi.waitFor(() => {
          expect(api.calls).toContain("platform.whatsapp.get");
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(25_000);
        });
        expect(api.calls.filter((call) => call === "platform.whatsapp.get")).toHaveLength(asked);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("leads super admins to the organization's data protection, and support not", async () => {
    stubApi({ "platform.organizations.get": { data: organizationDetails() } });
    const { unmount } = renderConsoleScreen(
      <OrganizationScreen organizationId={organizationId} onboarded={false} />,
      platformStaff("super-admin"),
    );
    expect(await screen.findByRole("link", { name: organization.dataProtection })).toHaveAttribute(
      "href",
      `/console/organizations/${organizationId}/data-protection`,
    );
    unmount();
    renderConsoleScreen(
      <OrganizationScreen organizationId={organizationId} onboarded={false} />,
      platformStaff("support"),
    );
    await screen.findByRole("heading", { level: 1, name: "Kerala Trails" });
    expect(screen.queryByRole("link", { name: organization.dataProtection })).toBeNull();
  });

  it("says, just after onboarding, that the Owner's invite is on its way", async () => {
    stubApi({ "platform.organizations.get": { data: organizationDetails() } });
    renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded />);
    expect(await screen.findByText(organization.onboarded)).toBeVisible();
  });

  it("says when there is no such organization, and leads back to the dashboard", async () => {
    stubApi({ "platform.organizations.get": { status: 404, reason: "ORGANIZATION_NOT_FOUND" } });
    renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded={false} />);
    expect(await screen.findByText(organization.notFound)).toBeVisible();
    expect(screen.getByRole("link", { name: organization.backToDashboard })).toHaveAttribute("href", "/console");
  });

  it("says the same of an address whose id isn't one, which the api refuses as invalid", async () => {
    stubApi({ "platform.organizations.get": { status: 400 } });
    renderConsoleScreen(<OrganizationScreen organizationId="not-an-id" onboarded={false} />);
    expect(await screen.findByText(organization.notFound)).toBeVisible();
    expect(screen.queryByText(organization.loadFailed)).toBeNull();
  });

  it("says when the organization didn't load, and loads it on Try again", async () => {
    const api = stubApi({ "platform.organizations.get": { status: 403 } });
    renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded={false} />);
    expect(await screen.findByText(organization.loadFailed)).toBeVisible();
    api.answer("platform.organizations.get", { data: organizationDetails() });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("heading", { level: 1, name: "Kerala Trails" })).toBeVisible();
  });
});
