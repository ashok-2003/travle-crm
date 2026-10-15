// An organization's page in the console: its name, code and status today; after onboarding, that the Owner's invite
// is on its way; its row, profile and members; the way to data protection for super admins only; an organization
// that doesn't exist, or a page that didn't load, said plainly.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationScreen } from "@/console/organizations/organization/organization-screen";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { organizationDetails, organizationId } from "./organization-details";
import { renderConsoleScreen } from "./render";

const { organization } = messages.consoleOrganizations;

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded={false} />);
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

  it("says when the organization didn't load, and loads it on Try again", async () => {
    const api = stubApi({ "platform.organizations.get": { status: 403 } });
    renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded={false} />);
    expect(await screen.findByText(organization.loadFailed)).toBeVisible();
    api.answer("platform.organizations.get", { data: organizationDetails() });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("heading", { level: 1, name: "Kerala Trails" })).toBeVisible();
  });
});
