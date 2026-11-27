// The firm's billing details: a super admin enters them once and saves; what is saved is shown again. Support is told
// it is a super admin's.
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Upload from "@/files/upload";
import { BillingDetailsScreen } from "@/console/invoices/billing-details-screen";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { inputsTo, renderConsole } from "../../support/render-console";
import { billing } from "./invoices-support";

const uploadFile = vi.hoisted(() => vi.fn<typeof Upload.uploadFile>());
vi.mock("@/files/upload", async (importOriginal) => ({ ...(await importOriginal<typeof Upload>()), uploadFile }));

const words = messages.consoleInvoices.billingDetails;
const logoName = words.names.logo;
/** The fixture's GSTIN has no valid check character, which the form would refuse: these tests save without one. */
const savable = { ...billing, gstin: null };
const choose = (name: string) => words.choose.replace("{name}", name);

const signed = {
  url: "https://files.example.test/platform/billing/logo-1.png?signature=1",
  method: "PUT" as const,
  headers: { "content-type": "image/png", "content-length": "9", "if-none-match": "*" },
  expiresAt: "2099-01-01T00:00:00.000Z",
  key: "platform/billing/logo-0199e7a0-0000-7000-8000-00000000a0f1.png",
};

/** Chooses a file as the browser's picker would (the picker is the hidden input the button opens). */
const pick = (name: string, file: File) => {
  fireEvent.change(screen.getByLabelText(choose(name), { selector: "input" }), { target: { files: [file] } });
};
const picture = (type = "image/png", size = 9) => new File([new Uint8Array(size)], "mark.png", { type });

beforeEach(() => {
  uploadFile.mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => undefined }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BillingDetailsScreen", () => {
  it("saves the first details, with the default prefixes", async () => {
    screenIs("wide");
    const api = stubApi({ "platform.invoices.billingDetails": { data: null } });
    renderConsole(<BillingDetailsScreen />);
    const legalName = await screen.findByLabelText(words.legalName);
    expect(screen.getByLabelText(words.invoicePrefix)).toHaveValue("INV");
    await userEvent.click(legalName);
    await userEvent.paste("Test Firm");
    await userEvent.click(screen.getByLabelText(words.address));
    await userEvent.paste("1 Test Road, Kochi");
    await userEvent.click(screen.getByRole("combobox", { name: words.stateCode }));
    await userEvent.click(await screen.findByRole("option", { name: /Kerala/ }));
    api.answer("platform.invoices.setBillingDetails", { data: billing });
    api.answer("platform.invoices.billingDetails", { data: billing });
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    expect(await screen.findByText(words.saved)).toBeVisible();
    expect(inputsTo("invoices.setBillingDetails")).toEqual([
      {
        legalName: "Test Firm",
        address: "1 Test Road, Kochi",
        stateCode: "32",
        proformaPrefix: "PI",
        invoicePrefix: "INV",
      },
    ]);
  });

  it("shows what is saved, and says what to fix before sending", async () => {
    screenIs("wide");
    stubApi({ "platform.invoices.billingDetails": { data: billing } });
    renderConsole(<BillingDetailsScreen />);
    expect(await screen.findByLabelText(words.legalName)).toHaveValue("Test Firm");
    expect(screen.getByLabelText(words.bankIfsc)).toHaveValue("TEST0000001");
    await userEvent.clear(screen.getByLabelText(words.legalName));
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    expect(await screen.findByText(words.problems.required)).toBeVisible();
    expect(inputsTo("invoices.setBillingDetails")).toEqual([]);
  });

  it("sends a chosen logo straight to storage, shows it, and saves its key with the details", async () => {
    screenIs("wide");
    uploadFile.mockResolvedValue();
    const api = stubApi({
      "platform.invoices.billingDetails": { data: savable },
      "platform.invoices.billingImageUploadLink": { data: signed },
    });
    renderConsole(<BillingDetailsScreen />);
    await screen.findByLabelText(words.legalName);
    pick(logoName, picture());
    expect(await screen.findByRole("img", { name: words.imageAlt.replace("{name}", logoName) })).toHaveAttribute(
      "src",
      "blob:preview",
    );
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(inputsTo("invoices.billingImageUploadLink")).toEqual([
      { kind: "logo", contentType: "image/png", sizeBytes: 9 },
    ]);
    expect(screen.getByText(words.uploaded)).toBeVisible();
    api.answer("platform.invoices.setBillingDetails", { data: { ...savable, logoKey: signed.key } });
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await vi.waitFor(() => {
      expect(inputsTo("invoices.setBillingDetails")).toMatchObject([{ logoKey: signed.key }]);
    });
  });

  it("shows the saved logo, and removing it saves the details without one", async () => {
    screenIs("wide");
    const api = stubApi({
      "platform.invoices.billingDetails": { data: { ...savable, logoKey: signed.key } },
      "platform.invoices.billingImageLink": { data: { url: "https://files.example.test/logo.png" } },
    });
    renderConsole(<BillingDetailsScreen />);
    expect(await screen.findByRole("img", { name: words.imageAlt.replace("{name}", logoName) })).toHaveAttribute(
      "src",
      "https://files.example.test/logo.png",
    );
    expect(screen.getByRole("button", { name: words.replace.replace("{name}", logoName) })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.remove.replace("{name}", logoName) }));
    expect(screen.queryByRole("img", { name: words.imageAlt.replace("{name}", logoName) })).toBeNull();
    api.answer("platform.invoices.setBillingDetails", { data: savable });
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await vi.waitFor(() => {
      expect(inputsTo("invoices.setBillingDetails")).toHaveLength(1);
    });
    expect(inputsTo("invoices.setBillingDetails")[0]).not.toHaveProperty("logoKey");
  });

  it("refuses a file that isn't a PNG or JPEG, or is over 1 MB, before asking for a link", async () => {
    screenIs("wide");
    const api = stubApi({ "platform.invoices.billingDetails": { data: savable } });
    renderConsole(<BillingDetailsScreen />);
    await screen.findByLabelText(words.legalName);
    pick(logoName, picture("application/pdf"));
    expect(await screen.findByText(words.imageProblems.type)).toBeVisible();
    pick(logoName, picture("image/png", 1_048_577));
    expect(await screen.findByText(words.imageProblems.size)).toBeVisible();
    expect(api.calls).not.toContain("platform.invoices.billingImageUploadLink");
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("saves the signatory's name and title", async () => {
    screenIs("wide");
    const api = stubApi({ "platform.invoices.billingDetails": { data: savable } });
    renderConsole(<BillingDetailsScreen />);
    await userEvent.click(await screen.findByLabelText(words.signatoryName));
    await userEvent.paste("Test Person");
    await userEvent.click(screen.getByLabelText(words.signatoryTitle));
    await userEvent.paste("Proprietor");
    api.answer("platform.invoices.setBillingDetails", { data: savable });
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await vi.waitFor(() => {
      expect(inputsTo("invoices.setBillingDetails")).toMatchObject([
        { signatoryName: "Test Person", signatoryTitle: "Proprietor" },
      ]);
    });
  });

  it("tells support it is a super admin's", async () => {
    screenIs("wide");
    const api = stubApi({});
    renderConsole(<BillingDetailsScreen />, platformStaff("support"));
    expect(await screen.findByText(words.superAdminsOnly)).toBeVisible();
    expect(api.calls).toEqual([]);
  });
});
