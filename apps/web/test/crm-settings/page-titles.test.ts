// Destinations', Blocked contacts' and Lead sources' pages are titled with the messages their headings show, so the tab and the
// screen can't drift apart.
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "settings") => Promise.resolve(createTranslator({ locale, messages, namespace })),
}));
// The titles alone: the screens themselves are tested on their own.
vi.mock("@/crm-settings/destinations-screen", () => ({ DestinationsScreen: () => null }));
vi.mock("@/crm-settings/blocked-contacts-screen", () => ({ BlockedContactsScreen: () => null }));
vi.mock("@/lead-sources/lead-sources-screen", () => ({ LeadSourcesScreen: () => null }));

const { settings } = messages;

const pages: [string, () => Promise<{ generateMetadata: () => Promise<unknown> }>, string][] = [
  ["/settings/destinations", () => import("@/app/(app)/settings/destinations/page"), settings.destinations.title],
  [
    "/settings/blocked-contacts",
    () => import("@/app/(app)/settings/blocked-contacts/page"),
    settings.blockedContacts.title,
  ],
  ["/settings/lead-sources", () => import("@/app/(app)/settings/lead-sources/page"), messages.sheets.list.title],
];

describe("crm settings page titles", () => {
  it.each(pages)("%s is titled with its heading's message", async (_, page, title) => {
    const { generateMetadata } = await page();
    expect(await generateMetadata()).toEqual({ title });
  });
});
