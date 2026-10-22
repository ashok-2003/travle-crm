// The website form's contracts: a strict submission, bounded answers, https-only links, the consent sentence and outputs
// that strip what they were not asked to show.
import { describe, expect, it } from "vitest";
import { personConsentState } from "../src/crm/index.js";
import {
  FORM_KEY_LENGTH,
  OFFERS_WORDING_VERSION,
  closedPublicForm,
  enquiryAnswers,
  formCountsView,
  offersWording,
  publicForm,
  saveWebsiteFormInput,
  websiteEnquiryInput,
  websiteFormPublic,
  websiteFormSettings,
  websiteFormView,
} from "../src/website-forms/index.js";

const submissionId = "0199e7a0-0000-7000-8000-0000000000c1";
const answers = { name: "Asha Rao", phone: "98765 43210" };
const submission = { submissionId, openedToken: "token", via: "hosted", homepage: "", answers };
const settings = {
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
};

describe("website form contracts", () => {
  it("accepts a plain submission and reads the phone as E.164", () => {
    const parsed = websiteEnquiryInput.parse(submission);
    expect(parsed.answers.phone).toBe("+919876543210");
  });

  it("rejects an unknown key in a submission, and in its answers", () => {
    expect(websiteEnquiryInput.safeParse({ ...submission, organizationId: submissionId }).success).toBe(false);
    expect(websiteEnquiryInput.safeParse({ ...submission, answers: { ...answers, stage: "won" } }).success).toBe(false);
  });

  it("rejects a name that is a web address", () => {
    for (const name of ["http://win.example", "www.win-now.biz", "claim at prizes.com", "https://x.test/a"]) {
      expect(enquiryAnswers.safeParse({ ...answers, name }).success, name).toBe(false);
    }
    expect(enquiryAnswers.safeParse({ ...answers, name: "Rahul S. Mehta" }).success).toBe(true);
  });

  it("bounds the budget at 1,000 and 1 crore", () => {
    const budget = (rupees: number) => enquiryAnswers.safeParse({ ...answers, budget: { rupees, basis: "everyone" } });
    expect(budget(999).success).toBe(false);
    expect(budget(1000).success).toBe(true);
    expect(budget(10_000_000).success).toBe(true);
    expect(budget(10_000_001).success).toBe(false);
    expect(budget(1500.5).success).toBe(false);
    expect(enquiryAnswers.safeParse({ ...answers, budget: { rupees: 5000, basis: "each" } }).success).toBe(false);
  });

  it("rejects children's ages above 17 and more than ten children", () => {
    expect(enquiryAnswers.safeParse({ ...answers, childrenAges: [4, 17] }).success).toBe(true);
    expect(enquiryAnswers.safeParse({ ...answers, childrenAges: [18] }).success).toBe(false);
    expect(enquiryAnswers.safeParse({ ...answers, childrenAges: Array.from({ length: 11 }, () => 5) }).success).toBe(
      false,
    );
    expect(enquiryAnswers.safeParse({ ...answers, adults: 0 }).success).toBe(false);
    expect(enquiryAnswers.safeParse({ ...answers, adults: 21 }).success).toBe(false);
  });

  it("rejects a typed destination over 80 characters, and an existing one without an id", () => {
    const typed = (text: string) => enquiryAnswers.safeParse({ ...answers, destination: { kind: "typed", text } });
    expect(typed("S".repeat(80)).success).toBe(true);
    expect(typed("S".repeat(81)).success).toBe(false);
    expect(
      enquiryAnswers.safeParse({ ...answers, destination: { kind: "existing", destinationId: "x" } }).success,
    ).toBe(false);
  });

  it("takes a month, flexible or nothing for the travel month", () => {
    for (const travelMonth of ["2026-12", "flexible", null]) {
      expect(enquiryAnswers.safeParse({ ...answers, travelMonth }).success, String(travelMonth)).toBe(true);
    }
    expect(enquiryAnswers.safeParse({ ...answers, travelMonth: "next summer" }).success).toBe(false);
  });

  it("rejects a non-https website or privacy url, and clears an empty one", () => {
    for (const key of ["websiteUrl", "privacyUrl"] as const) {
      for (const link of ["http://agency.example", "javascript:alert(1)", "agency.example", "https://nodots"]) {
        expect(saveWebsiteFormInput.safeParse({ ...settings, [key]: link }).success, `${key} ${link}`).toBe(false);
      }
      expect(saveWebsiteFormInput.parse({ ...settings, [key]: "https://agency.example/x" })[key]).toBe(
        "https://agency.example/x",
      );
      expect(saveWebsiteFormInput.parse({ ...settings, [key]: "  " })[key]).toBeNull();
    }
  });

  it("refuses a link with credentials or an IP address for a host", () => {
    for (const key of ["websiteUrl", "privacyUrl"] as const) {
      for (const link of [
        "https://user:pass@agency.example",
        "https://user@agency.example",
        "https://:pass@agency.example",
        "https://192.168.1.10/form",
        "https://8.8.8.8",
        "https://[2001:db8::1]/x",
        "https://2130706433/x",
      ]) {
        expect(saveWebsiteFormInput.safeParse({ ...settings, [key]: link }).success, `${key} ${link}`).toBe(false);
      }
      expect(saveWebsiteFormInput.safeParse({ ...settings, [key]: "https://agency.example:8443/a?b=1" }).success).toBe(
        true,
      );
    }
  });

  it("cuts nothing silently: the agency's words over their length are refused", () => {
    expect(saveWebsiteFormInput.safeParse({ ...settings, heading: "h".repeat(81) }).success).toBe(false);
    expect(saveWebsiteFormInput.safeParse({ ...settings, thankYouMessage: "t".repeat(501) }).success).toBe(false);
    expect(saveWebsiteFormInput.safeParse({ ...settings, heading: "h".repeat(80) }).success).toBe(true);
  });

  it("refuses an unknown key or an unknown mode in the settings", () => {
    expect(saveWebsiteFormInput.safeParse({ ...settings, enabled: true }).success).toBe(false);
    expect(saveWebsiteFormInput.safeParse({ ...settings, emailMode: "maybe" }).success).toBe(false);
  });

  it("offersWording names the agency and fits the ledger", () => {
    expect(offersWording("Asha Travels")).toBe("Send me travel offers and updates from Asha Travels.");
    expect(offersWording(`  ${"N".repeat(500)}  `).length).toBeLessThanOrEqual(300);
    expect(OFFERS_WORDING_VERSION).toBe(1);
    expect(FORM_KEY_LENGTH).toBe(38);
  });

  it("the output schemas strip unknown keys", () => {
    expect(websiteFormSettings.parse({ ...settings, enabled: false, secret: "x" })).not.toHaveProperty("secret");
    const state = { open: true, reason: null };
    const view = websiteFormView.parse({
      settings: { ...settings, enabled: true },
      key: null,
      link: null,
      embedLink: null,
      state,
      ownerName: null,
      extra: 1,
    });
    expect(view).not.toHaveProperty("extra");
    expect(formCountsView.parse({ enquiries: 1, newLeads: 1, repeatEnquiries: 0, stopped: 2, x: 1 })).toEqual({
      enquiries: 1,
      newLeads: 1,
      repeatEnquiries: 0,
      stopped: 2,
    });
    expect(personConsentState.parse({ state: null, at: null, fromForm: false, x: 1 })).toEqual({
      state: null,
      at: null,
      fromForm: false,
    });
  });

  it("a closed form carries only the agency's name, logo and website pair", () => {
    const closed = closedPublicForm.parse({
      organizationName: "Asha Travels",
      logoUrl: null,
      websiteUrl: "https://asha.example",
      websiteButtonText: "Our website",
      heading: "leak",
      fields: {},
    });
    expect(Object.keys(closed).sort()).toEqual(["logoUrl", "organizationName", "websiteButtonText", "websiteUrl"]);
    expect(websiteFormPublic.safeParse({ available: false, form: closed }).success).toBe(true);
    expect(publicForm.safeParse(closed).success).toBe(false);
  });
});
