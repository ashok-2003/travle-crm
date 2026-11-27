// The quotes settings screen previews the agency's UPI QR (no amount) with the words to test it, and shows nothing
// without a UPI id.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { encode } from "uqr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { upiPayLink } from "@travel-crm/contracts/quotes";
import { cardTints } from "@/components/card-tints";
import { messages } from "@/i18n/messages";
import { QuoteSettingsScreen } from "@/quotes/quote-settings-screen";
import { stubApi } from "../support/api-stub";
import { newQueryClient, renderWithApi } from "../organization/api";

const words = messages.quotes.settings;
const settings = {
  upiId: "sharma@bank",
  upiName: "Sharma Holidays",
  defaultTaxRateBasisPoints: 500,
  defaultTerms: "",
  defaultMarkupBasisPoints: 0,
  minMarginBasisPoints: null,
  minMarginPerPersonPaise: null,
  upiVerifiedAt: null,
  upiVerifiedBy: null,
  upiVerifiedByName: null,
};
const verified = {
  ...settings,
  upiVerifiedAt: "2026-11-27T10:10:00.000Z",
  upiVerifiedBy: "0199e7a0-0000-7000-8000-000000000001",
  upiVerifiedByName: "Ashok Kumar",
};

describe("the percent fields in quote settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keep the numbers font on the input, not on the label or hint", async () => {
    stubApi({ "quotes.settings": { data: settings } });
    renderWithApi(<QuoteSettingsScreen />, newQueryClient());
    const input = await screen.findByLabelText(words.markup);
    expect(input).toHaveClass("numbers");
    expect(screen.getByText(words.markup).closest(".numbers")).toBeNull();
    expect(screen.getByText(words.markupHint).closest(".numbers")).toBeNull();
  });
});

describe("the UPI QR preview in quote settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws the code of the UPI link without an amount, and says to pay ₹1 to check it", async () => {
    stubApi({ "quotes.settings": { data: settings } });
    renderWithApi(<QuoteSettingsScreen />, newQueryClient());
    const code = await screen.findByRole("img", { name: words.upiQrLabel.replace("{upiId}", "sharma@bank") });
    const link = upiPayLink(settings);
    expect(link).toBe("upi://pay?pa=sharma%40bank&pn=Sharma%20Holidays&cu=INR");
    const darkModules = encode(link ?? "", { ecc: "M", border: 2 })
      .data.flat()
      .filter(Boolean).length;
    expect(code.querySelector("path")?.getAttribute("d")?.split("z").length).toBe(darkModules + 1);
    expect(screen.getByText(words.upiQrTest)).toBeVisible();
  });

  it("sits on the attention tint until verified and on the good tint once verified", async () => {
    const api = stubApi({ "quotes.settings": { data: settings }, "quotes.verifyUpi": { data: verified } });
    renderWithApi(<QuoteSettingsScreen />, newQueryClient());
    const unverified = (await screen.findByText(words.upiUnverified)).closest("[data-slot=card]");
    expect(unverified).toHaveClass(cardTints.attention);
    api.answer("quotes.settings", { data: verified });
    await userEvent.click(screen.getByRole("button", { name: words.upiVerify }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: words.upiVerifyAction }));
    const done = (await screen.findByText(/Verified by Ashok Kumar/)).closest("[data-slot=card]");
    expect(done).toHaveClass(cardTints.good);
  });

  it("unverified: says to verify it, and confirming records the verification and then says who and when", async () => {
    const api = stubApi({ "quotes.settings": { data: settings }, "quotes.verifyUpi": { data: verified } });
    renderWithApi(<QuoteSettingsScreen />, newQueryClient());
    expect(await screen.findByText(words.upiUnverified)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.upiVerify }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(words.upiVerifyConfirm)).toBeVisible();
    api.answer("quotes.settings", { data: verified });
    await userEvent.click(within(dialog).getByRole("button", { name: words.upiVerifyAction }));
    expect(await screen.findByText("Verified by Ashok Kumar on 27 Nov, 3:40 pm")).toBeVisible();
    expect(api.calls).toContain("quotes.verifyUpi");
    expect(screen.queryByRole("button", { name: words.upiVerify })).toBeNull();
    expect(screen.queryByText(words.upiUnverified)).toBeNull();
  });

  it("verified: shows who and when in the agency's time, with no button; a former member is named as such", async () => {
    stubApi({ "quotes.settings": { data: { ...verified, upiVerifiedByName: null } } });
    renderWithApi(<QuoteSettingsScreen />, newQueryClient());
    expect(await screen.findByText(`Verified by ${words.upiVerifiedFormerMember} on 27 Nov, 3:40 pm`)).toBeVisible();
    expect(screen.queryByRole("button", { name: words.upiVerify })).toBeNull();
  });

  it("from an older api with no verification fields, it reads as unverified", async () => {
    const older = Object.fromEntries(Object.entries(settings).filter(([key]) => !key.startsWith("upiVerified")));
    stubApi({ "quotes.settings": { data: older } });
    renderWithApi(<QuoteSettingsScreen />, newQueryClient());
    expect(await screen.findByText(words.upiUnverified)).toBeVisible();
  });

  it("shows nothing without a UPI id", async () => {
    stubApi({ "quotes.settings": { data: { ...settings, upiId: "" } } });
    renderWithApi(<QuoteSettingsScreen />, newQueryClient());
    expect(await screen.findByLabelText(words.upiId)).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(words.upiQrTest)).toBeNull();
    expect(screen.queryByText(words.upiUnverified)).toBeNull();
    expect(screen.queryByRole("button", { name: words.upiVerify })).toBeNull();
  });
});
