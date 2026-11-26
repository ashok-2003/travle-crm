// The quotes settings screen previews the agency's UPI QR (no amount) with the words to test it, and shows nothing
// without a UPI id.
import { screen } from "@testing-library/react";
import { encode } from "uqr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { upiPayLink } from "@travel-crm/contracts/quotes";
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
};

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

  it("shows nothing without a UPI id", async () => {
    stubApi({ "quotes.settings": { data: { ...settings, upiId: "" } } });
    renderWithApi(<QuoteSettingsScreen />, newQueryClient());
    expect(await screen.findByLabelText(words.upiId)).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(words.upiQrTest)).toBeNull();
  });
});
