// The firm's billing details: a super admin enters them once and saves; what is saved is shown again. Support is told
// it is a super admin's.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingDetailsScreen } from "@/console/invoices/billing-details-screen";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { inputsTo, renderConsole } from "../../support/render-console";
import { billing } from "./invoices-support";

const words = messages.consoleInvoices.billingDetails;

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

  it("tells support it is a super admin's", async () => {
    screenIs("wide");
    const api = stubApi({});
    renderConsole(<BillingDetailsScreen />, platformStaff("support"));
    expect(await screen.findByText(words.superAdminsOnly)).toBeVisible();
    expect(api.calls).toEqual([]);
  });
});
