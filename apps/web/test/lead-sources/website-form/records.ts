// The website form as the api answers for it, for the Website form tests: the page's view and its parts.
import type { WebsiteFormSettings, WebsiteFormView } from "@travel-crm/contracts/website-forms";

export const formKey = "AZmgAAAAcAGAAAAAAAAAAQabcdefghijklmnop";

export function someSettings(overrides: Partial<WebsiteFormSettings> = {}): WebsiteFormSettings {
  return {
    enabled: true,
    allowEmbed: true,
    emailMode: "optional",
    destinationMode: "optional",
    travelMonthMode: "optional",
    travellersMode: "optional",
    budgetMode: "off",
    messageMode: "optional",
    offersTickbox: false,
    heading: null,
    introduction: null,
    thankYouMessage: null,
    websiteUrl: null,
    websiteButtonText: null,
    privacyUrl: null,
    ...overrides,
  };
}

export function aWebsiteFormView(overrides: Partial<WebsiteFormView> = {}): WebsiteFormView {
  return {
    settings: someSettings(),
    key: formKey,
    link: `https://app.example/f/${formKey}`,
    embedLink: `https://app.example/embed/${formKey}`,
    state: { open: true, reason: null },
    ownerName: "Asha Sharma",
    ...overrides,
  };
}
