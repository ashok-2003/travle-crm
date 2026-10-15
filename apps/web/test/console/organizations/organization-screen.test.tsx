// An organization's page in the console: its name, code and status today; after onboarding, that the Owner's invite
// is on its way; an organization that doesn't exist, or a page that didn't load, said plainly.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationScreen } from "@/console/organizations/organization/organization-screen";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { organizationDetails, organizationId } from "./organization-details";
import { renderConsoleScreen } from "./render";

const { organization } = messages.consoleOrganizations;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrganizationScreen", () => {
  it("shows the organization's name, code and status today", async () => {
    stubApi({ "platform.organizations.get": { data: organizationDetails() } });
    renderConsoleScreen(<OrganizationScreen organizationId={organizationId} onboarded={false} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Kerala Trails" })).toBeVisible();
    expect(screen.getByText("KERALA")).toBeVisible();
    expect(screen.getByText(messages.console.status.active)).toBeVisible();
    expect(screen.queryByText(organization.onboarded)).toBeNull();
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
