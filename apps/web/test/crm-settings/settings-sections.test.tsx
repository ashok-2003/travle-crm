// The settings screen leads to Destinations (settings:manage) and Blocked contacts (leads:assign), each only on a plan
// with the crm module (R51); hiding is a convenience, the api refuses the rest.
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { SettingsSections } from "@/organization/settings/settings-sections";
import type { SignedInMember } from "@/session/me-context";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { member } from "../support/members";

const { sections } = messages.settings;

function renderSections(me: SignedInMember, modules: PlanModule[] = ["crm"]) {
  return renderWithApi(<SettingsSections />, newQueryClient({ ...paidSubscription, modules }), me);
}

const linkTo = (name: string) => screen.queryByRole("link", { name: new RegExp(`^${name}`) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the crm settings sections", () => {
  it("shows the two sections only to their permissions and on the crm plan", () => {
    const owner = renderSections(member({ isOwner: true }));
    expect(linkTo(sections.destinations)).toHaveAttribute("href", routes.destinations);
    expect(linkTo(sections.blockedContacts)).toHaveAttribute("href", routes.blockedContacts);
    owner.unmount();

    const settings = renderSections(member({ permissions: ["settings:manage"] }));
    expect(linkTo(sections.destinations)).toHaveAttribute("href", routes.destinations);
    expect(linkTo(sections.blockedContacts)).toBeNull();
    settings.unmount();

    const assigner = renderSections(member({ permissions: ["leads:assign"] }));
    expect(linkTo(sections.destinations)).toBeNull();
    expect(linkTo(sections.blockedContacts)).toHaveAttribute("href", routes.blockedContacts);
    assigner.unmount();

    renderSections(member({ isOwner: true }), []);
    expect(linkTo(sections.destinations)).toBeNull();
    expect(linkTo(sections.blockedContacts)).toBeNull();
    expect(linkTo(sections.profile)).toHaveAttribute("href", routes.profile);
  });
});
