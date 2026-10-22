// The public GET names the page that asks: an embed the agency switched off gets the closed card, the hosted link the form.
import { describe, expect, it } from "vitest";
import { websiteFormPublicOf, type PublicFormServices } from "../src/public-form.js";

const organizationId = "0199e7a0-0000-7000-8000-0000000000f1";
const settings = {
  allowEmbed: false,
  emailMode: "optional",
  destinationMode: "optional",
  travelMonthMode: "optional",
  travellersMode: "optional",
  budgetMode: "off",
  messageMode: "optional",
  offersTickbox: false,
  heading: "Hello",
  introduction: null,
  thankYouMessage: null,
  websiteUrl: "https://asha.example",
  websiteButtonText: "Our website",
  privacyUrl: null,
} as const;

const services = {
  db: {
    forOrg: (_id: string, work: (tx: unknown) => unknown) =>
      Promise.resolve(work({ $queryRaw: () => Promise.resolve([]) })),
  },
  identity: {
    organizationProfile: () =>
      Promise.resolve({
        id: organizationId,
        name: "Asha Travels",
        code: "A",
        timeZone: "Asia/Kolkata",
        contactEmail: null,
      }),
  },
  profiles: { get: () => Promise.resolve(null) },
  files: { list: () => Promise.resolve([]), systemDownloadLink: () => Promise.reject(new Error("none")) },
} as unknown as PublicFormServices;

const ask = (via: "hosted" | "embedded", allowEmbed: boolean) =>
  websiteFormPublicOf(services, {
    organizationId,
    settings: { ...settings, allowEmbed },
    openedToken: "t",
    turnstileSiteKey: null,
    now: new Date("2026-10-22T06:00:00Z"),
    via,
  });

describe("websiteFormPublicOf", () => {
  it("an embed with embedding off gets the closed card, with no fields", async () => {
    const answer = await ask("embedded", false);
    expect(answer).toEqual({
      available: false,
      form: {
        organizationName: "Asha Travels",
        logoUrl: null,
        websiteUrl: "https://asha.example",
        websiteButtonText: "Our website",
      },
    });
  });

  it("the hosted link, and an embed with embedding on, get the form", async () => {
    for (const [via, allow] of [
      ["hosted", false],
      ["hosted", true],
      ["embedded", true],
    ] as const) {
      const answer = await ask(via, allow);
      expect(answer.available, `${via} ${String(allow)}`).toBe(true);
      expect(answer.form).toHaveProperty("fields");
    }
  });
});
