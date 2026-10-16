// What the subscription section's tests share: a payment, plans on sale, a suspension made by hand, the section
// rendered over the stubbed api, a detail's value by its label, and the changes in its Change menu, listed or opened.
import type { PlanSummary, SubscriptionPayment, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubscriptionSection } from "@/console/organizations/subscription/subscription-section";
import { messages } from "@/i18n/messages";
import { stubApi, type Answer } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { organizationDetails, subscriptionDetails } from "./organization-details";
import { renderConsole } from "../../support/render-console";

export const words = messages.consoleOrganizations.subscription;
const { organization } = organizationDetails();

export function payment(overrides: Partial<SubscriptionPayment> = {}): SubscriptionPayment {
  return {
    id: "0199a000-0000-7000-8000-0000000000f1",
    amountPaise: 295_000,
    paidOn: "2026-10-01",
    paidThrough: "2026-10-31",
    reference: "NEFT UTR 412345678901",
    provider: "manual",
    recordedBy: "0199a000-0000-7000-8000-0000000000ad",
    recordedAt: "2026-10-01T05:00:00.000Z",
    voided: null,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanSummary>): PlanSummary {
  return {
    id: "0199a000-0000-7000-8000-0000000000c1",
    key: "growth",
    name: "Growth",
    monthlyPricePaise: 250_000,
    yearlyPricePaise: 2_500_000,
    extraSeatMonthlyPricePaise: null,
    extraSeatYearlyPricePaise: null,
    seatLimit: 10,
    whatsappNumberLimit: 1,
    storageLimitBytes: 10_000_000_000,
    modules: ["crm"],
    forSale: true,
    archived: false,
    ...overrides,
  };
}

/** The subscription's own plan (organization-details.ts), and one sold yearly only. */
export const growth = plan({});
export const pro = plan({
  id: "0199a000-0000-7000-8000-0000000000c2",
  key: "pro",
  name: "Pro",
  monthlyPricePaise: null,
  yearlyPricePaise: 5_000_000,
});

export const suspendedByHand: SubscriptionWithPayments = {
  subscription: subscriptionDetails({
    status: "suspended",
    access: "export_only",
    manualSuspension: { at: "2026-10-16T05:00:00.000Z", by: null, reason: "Chargeback" },
  }),
  payments: [],
};

export function renderSection(
  found: SubscriptionWithPayments = { subscription: subscriptionDetails(), payments: [payment()] },
  answers: Record<string, Answer> = {},
  staff = platformStaff(),
) {
  const api = stubApi(answers);
  renderConsole(<SubscriptionSection organization={organization} subscription={found} />, staff);
  return api;
}

/** A detail's value by its label. */
export function valueOf(label: string): HTMLElement {
  const value = screen.getByText(label, { selector: "[data-slot=item-description]" }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`no value for ${label}`);
  return value;
}

/** The Change menu's items, in order (the menu opened, then closed again). */
export async function changesOffered(): Promise<HTMLElement[]> {
  await userEvent.click(screen.getByRole("button", { name: words.change }));
  const items = await screen.findAllByRole("menuitem");
  await userEvent.keyboard("{Escape}");
  return items;
}

/** A change's dialog, opened from the Change menu. */
export async function openChange(action: string, title: string | RegExp): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: words.change }));
  await userEvent.click(await screen.findByRole("menuitem", { name: action }));
  return screen.findByRole("dialog", { name: title });
}

/** A dialog opened by its own button (Record a payment, a payment's Void). */
export async function openDialog(button: string, title: string | RegExp): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: button }));
  return screen.findByRole("dialog", { name: title });
}

/** Types into a box at once, as a paste: the form reads it the same way, and jsdom is slow at keystrokes. */
export async function fill(dialog: HTMLElement, label: string, text: string): Promise<void> {
  await userEvent.click(within(dialog).getByLabelText(label));
  await userEvent.paste(text);
}
