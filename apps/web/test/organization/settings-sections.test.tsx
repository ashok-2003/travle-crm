// The settings screen leads to the organization's other settings, each shown to the roles that may use it (spec 11:
// navigation follows the caller's permissions): the business profile, branding, business files and documents with
// settings:manage, the audit log with audit:view. Hiding is a convenience; the api refuses the rest.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { SettingsSections } from "@/organization/settings/settings-sections";
import { member } from "../support/members";
import { renderAs } from "./render";

const { sections } = messages.settings;

const links = () => screen.queryAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);

describe("SettingsSections", () => {
  it("leads an Owner to every section", () => {
    renderAs(<SettingsSections />, member({ isOwner: true }));
    expect(links()).toEqual([
      [expect.stringContaining(sections.profile), routes.profile],
      [expect.stringContaining(sections.branding), routes.branding],
      [expect.stringContaining(sections.files), routes.files],
      [expect.stringContaining(sections.documents), routes.documents],
      [expect.stringContaining(sections.audit), routes.audit],
    ]);
  });

  it("shows each section only to roles holding its permission", () => {
    renderAs(<SettingsSections />, member({ permissions: ["settings:manage"] }));
    expect(screen.queryByRole("link", { name: new RegExp(sections.audit) })).toBeNull();
    expect(screen.getByRole("link", { name: new RegExp(sections.branding) })).toBeVisible();
  });

  it("shows the audit log alone to a role that may only read it", () => {
    renderAs(<SettingsSections />, member({ permissions: ["audit:view"] }));
    expect(links()).toEqual([[expect.stringContaining(sections.audit), routes.audit]]);
  });

  it("shows nothing at all to a role that may use none of them", () => {
    const { container } = renderAs(<SettingsSections />, member({ permissions: ["leads:view"] }));
    expect(container).toBeEmptyDOMElement();
  });
});
