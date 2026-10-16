// The business profile screen (spec 7.1): the Owner sees what onboarding saved and completes it; the api's own rules
// are checked before anything is sent, a GSTIN of another state named as such; the saved profile comes back as the api
// keeps it and the setup checklist is asked again; a refusal shows its sentence; a read-only organization's Owner may
// look but not save, and reads why.
import type { BusinessProfileDetails } from "@travel-crm/contracts/profile";
import { useQuery } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "@/business/profile/profile-screen";
import { useTRPC } from "@/data/trpc";
import { messages } from "@/i18n/messages";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { newQueryClient, renderWithApi } from "../organization/api";
import { inputsSentTo } from "./sent";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const words = messages.business.profile;

const saved: BusinessProfileDetails = {
  legalName: "Konkan Trails LLP",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: null,
  contactName: "Lakshmi Nair",
  contactPhone: "+919820012345",
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  bankName: null,
  invoicePrefix: null,
  updatedAt: "2026-10-16T05:00:00.000Z",
};

const subscription = (access: "full" | "read_only") => ({
  data: {
    status: access === "full" ? "active" : "read_only",
    access,
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
  },
});

/** Stands in for the setup checklist on another screen: it asks the api again when the profile is saved. */
function ChecklistProbe() {
  const trpc = useTRPC();
  useQuery(trpc.organization.setup.get.queryOptions());
  return null;
}

const owner = member({ isOwner: true });

describe("ProfileScreen", () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the saved profile, ids and numbers mono and the phone after its +91", async () => {
    stubApi({ "organization.profile.get": { data: saved }, "subscription.get": subscription("full") });
    renderWithApi(<ProfileScreen />, newQueryClient(null), owner);
    expect(await screen.findByLabelText(words.legalName)).toHaveValue("Konkan Trails LLP");
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByLabelText(words.gstin)).toHaveClass("numbers");
    expect(screen.getByLabelText(words.contactPhone)).toHaveValue("98200 12345");
    expect(screen.getByText("+91")).toBeVisible();
    expect(screen.getByRole("combobox", { name: words.gstState })).toHaveTextContent("Maharashtra");
  });

  it("starts empty, with a state to choose, before any profile was saved", async () => {
    stubApi({ "organization.profile.get": { data: null }, "subscription.get": subscription("full") });
    renderWithApi(<ProfileScreen />, newQueryClient(null), owner);
    expect(await screen.findByLabelText(words.legalName)).toHaveValue("");
    expect(screen.getByRole("combobox", { name: words.gstState })).toHaveTextContent(words.chooseState);
  });

  it("names the state a GSTIN belongs to before sending it", async () => {
    const api = stubApi({ "organization.profile.get": { data: saved }, "subscription.get": subscription("full") });
    renderWithApi(<ProfileScreen />, newQueryClient(null), owner);
    const gstin = await screen.findByLabelText(words.gstin);
    await userEvent.clear(gstin);
    await userEvent.type(gstin, "29AAPFU0939F1ZR");
    await userEvent.click(screen.getByRole("button", { name: messages.common.save }));
    expect(await screen.findByText(words.problems.gstinOfAnotherState.replace("{state}", "Karnataka"))).toBeVisible();
    expect(gstin).toHaveAttribute("aria-invalid", "true");
    expect(api.calls).not.toContain("organization.profile.update");
  });

  it("saves what the api keeps, says so, and asks for the setup checklist again", async () => {
    const api = stubApi({
      "organization.profile.get": { data: saved },
      "subscription.get": subscription("full"),
      "organization.setup.get": { data: { steps: [], done: false } },
    });
    renderWithApi(
      <>
        <ProfileScreen />
        <ChecklistProbe />
      </>,
      newQueryClient(null),
      owner,
    );
    await userEvent.type(await screen.findByLabelText(words.address), "12 Hill Road, Mumbai 400050");
    await userEvent.type(screen.getByLabelText(words.bankIfsc), "hdfc0001234");
    await userEvent.type(screen.getByLabelText(words.bankAccountNumber), "0012 3456 7890");
    api.answer("organization.profile.update", {
      data: {
        ...saved,
        address: "12 Hill Road, Mumbai 400050",
        bankIfsc: "HDFC0001234",
        bankAccountNumber: "001234567890",
        updatedAt: "2026-10-16T06:00:00.000Z",
      },
    });
    await userEvent.click(screen.getByRole("button", { name: messages.common.save }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(words.saved);
    });
    expect(inputsSentTo("organization.profile.update")).toEqual([
      {
        ...saved,
        updatedAt: undefined,
        address: "12 Hill Road, Mumbai 400050",
        bankIfsc: "HDFC0001234",
        bankAccountNumber: "001234567890",
      },
    ]);
    // The form shows the profile as the api keeps it.
    expect(await screen.findByDisplayValue("001234567890")).toBeVisible();
    await waitFor(() => {
      expect(api.calls.filter((path) => path === "organization.setup.get")).toHaveLength(2);
    });
  });

  it("shows a refusal's sentence and keeps what was typed", async () => {
    stubApi({
      "organization.profile.get": { data: saved },
      "subscription.get": subscription("full"),
      "organization.profile.update": { status: 403, reason: "MISSING_PERMISSION" },
    });
    renderWithApi(<ProfileScreen />, newQueryClient(null), owner);
    await userEvent.type(await screen.findByLabelText(words.invoicePrefix), "kt");
    await userEvent.click(screen.getByRole("button", { name: messages.common.save }));
    expect(await screen.findByText(messages.errors.reasons.MISSING_PERMISSION)).toBeVisible();
    expect(screen.getByLabelText(words.invoicePrefix)).toHaveValue("kt");
  });

  it("lets a read-only organization's Owner look, but not save, and says why", async () => {
    stubApi({ "organization.profile.get": { data: saved }, "subscription.get": subscription("read_only") });
    renderWithApi(<ProfileScreen />, newQueryClient(null), owner);
    expect(await screen.findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.save })).toBeDisabled();
    expect(screen.getByLabelText(words.legalName)).toBeDisabled();
  });

  it("says so when the profile didn't load, and tries again", async () => {
    const api = stubApi({ "organization.profile.get": { status: 500 }, "subscription.get": subscription("full") });
    renderWithApi(<ProfileScreen />, newQueryClient(null), owner);
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("organization.profile.get", { data: saved });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByLabelText(words.legalName)).toHaveValue("Konkan Trails LLP");
  });
});
