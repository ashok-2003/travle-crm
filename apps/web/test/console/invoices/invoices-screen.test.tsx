// The console's invoices: the list with ₹ amounts and "26 Nov" dates, New invoice waiting for billing details, the GST
// choice held back until a GSTIN is saved, the live totals, a refusal before anything is sent, and Download, Copy and
// Cancel on each row. Super admins only.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesScreen } from "@/console/invoices/invoices-screen";
import { messages } from "@/i18n/messages";
import { stubApi, type Answer } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { inputsTo, renderConsole } from "../../support/render-console";
import { billing, cancelled, detail, page, summary } from "./invoices-support";

const { invoices: words, invoiceForm: form, cancelInvoice } = messages.consoleInvoices;
const gstSentence = messages.consoleInvoices.invoiceForm.gstNeedsGstin;

function open(answers: Record<string, Answer> = {}, staff = platformStaff("super-admin")) {
  const api = stubApi({
    "platform.invoices.billingDetails": { data: billing },
    "platform.invoices.list": page(summary, cancelled),
    ...answers,
  });
  renderConsole(<InvoicesScreen />, staff);
  return api;
}

const newInvoice = async () => {
  await userEvent.click(await screen.findByRole("button", { name: words.new }));
  return screen.getByRole("dialog", { name: form.createTitle });
};
const fill = async (dialog: HTMLElement, label: string, value: string) => {
  await userEvent.click(within(dialog).getByLabelText(label));
  await userEvent.paste(value);
};
const choose = async (dialog: HTMLElement, label: string, option: string) => {
  await userEvent.click(within(dialog).getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: new RegExp(option) }));
};

beforeEach(() => {
  screenIs("wide");
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-26T10:00:00Z") });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("InvoicesScreen", () => {
  it("lists the invoices with their total in rupees, date and status", async () => {
    open();
    const row = within(await screen.findByRole("row", { name: /INV\/2026-27\/001/ }));
    expect(row.getByText("Acme Holidays")).toBeVisible();
    expect(row.getByText("₹11,800.00")).toBeVisible();
    expect(row.getByText("26 Nov")).toBeVisible();
    expect(row.getByText(words.statuses.issued)).toBeVisible();
    const other = within(screen.getByRole("row", { name: /PI\/2026-27\/001/ }));
    expect(other.getByText(words.kinds.proforma)).toBeVisible();
    expect(other.getByText(words.statuses.cancelled)).toBeVisible();
  });

  it("says so, and links to Billing details, when there are none, keeping New invoice off", async () => {
    open({ "platform.invoices.billingDetails": { data: null } });
    expect(await screen.findByText(new RegExp(words.needsBillingDetails.slice(0, 20)))).toBeVisible();
    expect(screen.getByRole("link", { name: words.goToBillingDetails })).toHaveAttribute(
      "href",
      "/console/invoices/billing-details",
    );
    expect(screen.getByRole("button", { name: words.new })).toBeDisabled();
  });

  it("holds the GST choice at None, with the reason, until a GSTIN is saved", async () => {
    open({ "platform.invoices.billingDetails": { data: { ...billing, gstin: null } } });
    const dialog = await newInvoice();
    expect(within(dialog).getByRole("combobox", { name: form.gstRate })).toBeDisabled();
    expect(within(dialog).getByText(gstSentence)).toBeVisible();
  });

  it("makes an invoice, previewing the totals as the api will make them and sending what the form holds", async () => {
    const api = open();
    const dialog = await newInvoice();
    expect(within(dialog).getByLabelText(form.notes)).toHaveValue(billing.defaultTerms);
    await fill(dialog, form.billToName, "Acme Holidays");
    await fill(dialog, form.lineDescription, "Starter plan, 3 months");
    await fill(dialog, form.lineAmount, "10,000");
    await choose(dialog, form.billToState, "Maharashtra");
    await choose(dialog, form.gstRate, "18%");
    const totals = within(within(dialog).getByRole("region", { name: form.totals }));
    expect(totals.getByText("IGST 18%")).toBeVisible();
    expect(totals.getByText("₹1,800.00")).toBeVisible();
    expect(totals.getByText("₹11,800.00")).toBeVisible();

    await choose(dialog, form.billToState, "Kerala");
    expect(totals.getByText("CGST 9%")).toBeVisible();
    expect(totals.getByText("SGST 9%")).toBeVisible();

    api.answer("platform.invoices.create", { data: detail });
    await userEvent.click(within(dialog).getByRole("button", { name: form.create }));
    expect(await screen.findByText(form.made.replace("{number}", detail.number))).toBeVisible();
    expect(inputsTo("invoices.create")).toEqual([
      {
        kind: "invoice",
        issuedOn: "2026-11-26",
        billTo: { name: "Acme Holidays", stateCode: "32" },
        lines: [{ description: "Starter plan, 3 months", amountPaise: 1_000_000 }],
        gstRateBasisPoints: 1800,
        notes: "Pay within 7 days.",
      },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refuses a GST rate with no state before anything is sent", async () => {
    open();
    const dialog = await newInvoice();
    await fill(dialog, form.billToName, "Acme Holidays");
    await fill(dialog, form.lineDescription, "Starter plan");
    await fill(dialog, form.lineAmount, "10,000");
    await choose(dialog, form.gstRate, "18%");
    await userEvent.click(within(dialog).getByRole("button", { name: form.create }));
    expect(await within(dialog).findByText(form.problems.stateNeededForGst)).toBeVisible();
    expect(inputsTo("invoices.create")).toEqual([]);
  });

  it("adds and removes lines", async () => {
    open();
    const dialog = await newInvoice();
    expect(within(dialog).queryByRole("button", { name: form.removeLine.replace("{number}", "1") })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: form.addLine }));
    expect(within(dialog).getAllByLabelText(form.lineAmount)).toHaveLength(2);
    await userEvent.click(within(dialog).getByRole("button", { name: form.removeLine.replace("{number}", "2") }));
    expect(within(dialog).getAllByLabelText(form.lineAmount)).toHaveLength(1);
  });

  it("downloads an invoice, a cancelled one too, by opening the api's link in a new tab", async () => {
    const opened = vi.fn();
    vi.stubGlobal("open", opened);
    open({ "platform.invoices.downloadLink": { data: { url: "https://files.example/invoice.pdf" } } });
    for (const invoice of [summary, cancelled]) {
      await userEvent.click(
        await screen.findByRole("button", { name: words.actionsFor.replace("{number}", invoice.number) }),
      );
      await userEvent.click(screen.getByRole("menuitem", { name: words.download }));
    }
    await vi.waitFor(() => {
      expect(opened).toHaveBeenCalledTimes(2);
    });
    expect(opened).toHaveBeenCalledWith("https://files.example/invoice.pdf", "_blank", "noopener");
    expect(inputsTo("invoices.downloadLink")).toEqual([{ invoiceId: summary.id }, { invoiceId: cancelled.id }]);
  });

  it("copies an invoice into a new one with today's date and no due date", async () => {
    const api = open({ "platform.invoices.get": { data: detail } });
    await userEvent.click(
      await screen.findByRole("button", { name: words.actionsFor.replace("{number}", summary.number) }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: words.copy }));
    const dialog = await screen.findByRole("dialog", { name: form.copyTitle.replace("{number}", detail.number) });
    expect(within(dialog).getByLabelText(form.billToName)).toHaveValue("Acme Holidays");
    expect(within(dialog).getByLabelText(form.lineDescription)).toHaveValue("Starter plan, 3 months");
    expect(within(dialog).getByLabelText(form.lineAmount)).toHaveValue("10,000");
    expect(within(dialog).getByLabelText(form.issuedOn)).toHaveValue("26/11/2026");
    expect(within(dialog).getByLabelText(form.dueOn)).toHaveValue("");
    api.answer("platform.invoices.create", { data: { ...detail, number: "INV/2026-27/002" } });
    await userEvent.click(within(dialog).getByRole("button", { name: form.create }));
    await vi.waitFor(() => {
      expect(inputsTo("invoices.create")).toEqual([
        {
          kind: "invoice",
          issuedOn: "2026-11-26",
          billTo: { name: "Acme Holidays", address: "2 Sample Street, Pune", stateCode: "27" },
          lines: [{ description: "Starter plan, 3 months", amountPaise: 1_000_000 }],
          gstRateBasisPoints: 1800,
          notes: "Pay within 7 days.",
        },
      ]);
    });
  });

  it("cancels an issued invoice only with a reason, and shows the row cancelled", async () => {
    const api = open();
    await userEvent.click(
      await screen.findByRole("button", { name: words.actionsFor.replace("{number}", summary.number) }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: words.cancel }));
    const confirm = screen.getByRole("alertdialog", { name: cancelInvoice.title.replace("{number}", summary.number) });
    const action = within(confirm).getByRole("button", { name: cancelInvoice.action });
    expect(action).toBeDisabled();
    await userEvent.click(within(confirm).getByLabelText(cancelInvoice.reason));
    await userEvent.paste("Wrong company");
    api.answer("platform.invoices.cancel", { data: { ...detail, status: "cancelled" } });
    api.answer("platform.invoices.list", page({ ...summary, status: "cancelled" }, cancelled));
    await userEvent.click(action);
    await vi.waitFor(() => {
      expect(inputsTo("invoices.cancel")).toEqual([{ invoiceId: summary.id, reason: "Wrong company" }]);
    });
    expect(await screen.findByText(cancelInvoice.cancelled.replace("{number}", summary.number))).toBeVisible();
    const row = within(screen.getByRole("row", { name: /INV\/2026-27\/001/ }));
    expect(await row.findByText(words.statuses.cancelled)).toBeVisible();
  });

  it("offers no cancel on a cancelled invoice", async () => {
    open();
    await userEvent.click(
      await screen.findByRole("button", { name: words.actionsFor.replace("{number}", cancelled.number) }),
    );
    expect(screen.getByRole("menuitem", { name: words.download })).toBeVisible();
    expect(screen.queryByRole("menuitem", { name: words.cancel })).toBeNull();
  });

  it("tells support it is a super admin's, asking nothing of the api", async () => {
    const api = open({}, platformStaff("support"));
    expect(await screen.findByText(words.superAdminsOnly)).toBeVisible();
    expect(api.calls).toEqual(expect.not.arrayContaining(["platform.invoices.list"]));
  });
});
