// An invoice prefix the app's own documents are numbered with (SMPL for the branding's samples, Ruling D) is refused by
// the api's own schema before anything is sent, and the form says why, not "use 2-5 letters".
import type * as ProfileContracts from "@travel-crm/contracts/profile";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "@/business/profile/profile-screen";
import { toProfileInput } from "@/business/profile/profile-values";
import { messages } from "@/i18n/messages";
import { stubApi } from "../support/api-stub";
import { newQueryClient, renderWithApi } from "../organization/api";
import { owner, saved, subscription } from "./profile";

// The contract refuses SMPL and DOC as an invoice prefix (packages/contracts, Ruling D). The same refusal stands in
// for it here, so the test holds whichever contract it runs against.
vi.mock("@travel-crm/contracts/profile", async (importOriginal) => {
  const contracts = await importOriginal<typeof ProfileContracts>();
  return {
    ...contracts,
    updateOrganizationProfileInput: contracts.updateOrganizationProfileInput.superRefine((profile, context) => {
      if (profile.invoicePrefix === "SMPL" || profile.invoicePrefix === "DOC") {
        context.addIssue({ code: "custom", path: ["invoicePrefix"], message: "Kept for the app's own documents" });
      }
    }),
  };
});

const words = messages.business.profile;

const typed = (invoicePrefix: string) => ({
  legalName: "Konkan Trails LLP",
  gstin: "",
  gstStateCode: "27",
  address: "",
  contactName: "",
  contactPhone: "",
  bankAccountName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  bankName: "",
  invoicePrefix,
});

describe("a reserved invoice prefix", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is told apart from letters that aren't a prefix at all", () => {
    expect(toProfileInput(typed(" smpl "))).toEqual({
      ok: false,
      problems: { invoicePrefix: "invoicePrefixReserved" },
    });
    expect(toProfileInput(typed("S1"))).toEqual({ ok: false, problems: { invoicePrefix: "invoicePrefix" } });
    expect(toProfileInput(typed("KT"))).toMatchObject({ ok: true });
  });

  it("is refused under its box before anything is sent, saying why", async () => {
    const api = stubApi({ "organization.profile.get": { data: saved }, "subscription.get": subscription("full") });
    renderWithApi(<ProfileScreen />, newQueryClient(null), owner);
    await userEvent.type(await screen.findByLabelText(words.invoicePrefix), "smpl");
    await userEvent.click(screen.getByRole("button", { name: messages.common.save }));
    expect(await screen.findByText(words.problems.invoicePrefixReserved)).toBeVisible();
    expect(screen.getByLabelText(words.invoicePrefix)).toHaveAttribute("aria-invalid", "true");
    expect(api.calls).not.toContain("organization.profile.update");
  });
});
