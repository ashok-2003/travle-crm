// The organization's subscription in the console: its state today beside the recorded one, the plan, dates and
// overrides, the price with GST in mono, and the payments; and every change through subscriptions.*,
// each with what it sends and a refusal's sentence kept in its dialog. Lifting a suspension is a super admin's.
import type { PlanSummary, SubscriptionPayment, SubscriptionWithPayments } from "@travel-crm/contracts/subscriptions";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionSection } from "@/console/organizations/subscription/subscription-section";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi, type Answer } from "../../support/api-stub";
import { chooseDay } from "../../support/choose-day";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { organizationDetails, organizationId, subscriptionDetails } from "./organization-details";
import { inputsTo as inputsSentTo, renderConsole as renderConsoleScreen } from "../../support/render-console";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

const { subscription: words } = messages.consoleOrganizations;
const onSale = messages.consoleOrganizations.onboard.subscription;
const { organization } = organizationDetails();

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
const growth = plan({});
const pro = plan({
  id: "0199a000-0000-7000-8000-0000000000c2",
  key: "pro",
  name: "Pro",
  monthlyPricePaise: null,
  yearlyPricePaise: 5_000_000,
});

function payment(overrides: Partial<SubscriptionPayment> = {}): SubscriptionPayment {
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

function renderSection(
  found: SubscriptionWithPayments = { subscription: subscriptionDetails(), payments: [payment()] },
  answers: Record<string, Answer> = {},
  staff = platformStaff(),
) {
  const api = stubApi(answers);
  renderConsoleScreen(<SubscriptionSection organization={organization} subscription={found} />, staff);
  return api;
}

function valueOf(label: string): HTMLElement {
  const value = screen.getByText(label, { selector: "[data-slot=item-description]" }).nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`no value for ${label}`);
  return value;
}

async function openDialog(button: string, title: string | RegExp): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: button }));
  return screen.findByRole("dialog", { name: title });
}

async function fill(dialog: HTMLElement, label: string, text: string): Promise<void> {
  await userEvent.click(within(dialog).getByLabelText(label));
  await userEvent.paste(text);
}

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
  toast.success.mockReset();
});

describe("SubscriptionSection", { timeout: 20_000 }, () => {
  it("shows today's state beside the recorded one, the plan, dates, overrides and the price with GST", () => {
    renderSection({
      subscription: subscriptionDetails({
        status: "past_due",
        since: "2026-11-01",
        nextChangeOn: "2026-11-08",
        recorded: { status: "active", since: "2026-10-01" },
        extraModules: ["quotes"],
      }),
      payments: [payment()],
    });
    expect(valueOf(words.status)).toHaveTextContent(`${messages.console.status.past_due}since 1 Nov`);
    expect(valueOf(words.status)).toHaveTextContent("The nightly job last recorded Active since 1 Oct");
    expect(valueOf(words.nextChange)).toHaveTextContent("8 Nov, if nothing is paid");
    expect(valueOf(words.plan)).toHaveTextContent("Growth, billed monthly");
    expect(valueOf(words.paidThroughOn)).toHaveTextContent("31 Oct");
    expect(valueOf(words.trialEndsOn)).toHaveTextContent(words.notSet);
    expect(valueOf(words.extraModules)).toHaveTextContent("Quotes");
    const price = screen.getByRole("table", { name: words.price.caption.monthly });
    expect(within(price).getByRole("row", { name: "The plan's price ₹2,500.00" })).toBeVisible();
    // One GST row until the platform's own GST state is set, which decides between CGST with SGST, and IGST.
    expect(within(price).getByRole("row", { name: "GST at 18% ₹450.00" })).toBeVisible();
    expect(within(price).queryByRole("row", { name: /CGST|SGST/ })).toBeNull();
    expect(within(price).getByRole("row", { name: "Total a month ₹2,950.00" })).toBeVisible();
    expect(within(price).getByText("₹2,950.00")).toHaveClass("numbers", "text-right");
  });

  it("lists the payments, money received in forest, a voided one with its reason", () => {
    const voided = payment({
      id: "0199a000-0000-7000-8000-0000000000f2",
      voided: { at: "2026-10-02T05:00:00.000Z", by: null, reason: "Entered twice" },
    });
    renderSection({ subscription: subscriptionDetails(), payments: [payment(), voided] });
    const [first, second] = screen.getAllByRole("row").filter((row) => row.textContent.includes("NEFT"));
    expect(within(first ?? document.body).getByText("₹2,950")).toHaveClass("text-money");
    expect(within(second ?? document.body).getByText(words.payments.voided)).toBeVisible();
    expect(within(second ?? document.body).getByText("Entered twice")).toBeVisible();
  });

  it("records a payment, reading the rupees typed", async () => {
    renderSection(undefined, { "platform.subscriptions.recordPayment": { data: payment() } });
    const dialog = await openDialog(words.recordPayment.action, words.recordPayment.title);
    await fill(dialog, words.recordPayment.amount, "2950");
    await chooseDay(within(dialog).getByLabelText(words.recordPayment.paidOn), "2026-11-01");
    await chooseDay(within(dialog).getByLabelText(words.recordPayment.paidThrough), "2026-11-30");
    await userEvent.click(within(dialog).getByRole("button", { name: words.recordPayment.submit }));
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(words.recordPayment.done);
    });
    expect(inputsSentTo("subscriptions.recordPayment")).toEqual([
      { organizationId, amountPaise: 295_000, paidOn: "2026-11-01", paidThrough: "2026-11-30", reference: null },
    ]);
  });

  it("voids a payment, with the reason", async () => {
    renderSection(undefined, { "platform.subscriptions.voidPayment": { data: payment() } });
    const dialog = await openDialog(
      "Void the payment of ₹2,950 paid on 1 Oct",
      "Void the payment of ₹2,950 paid on 1 Oct?",
    );
    await fill(dialog, words.reason.label, "Entered twice");
    await userEvent.click(within(dialog).getByRole("button", { name: words.voidPayment.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.voidPayment")).toEqual([
        { organizationId, paymentId: payment().id, reason: "Entered twice" },
      ]);
    });
  });

  it("suspends with a reason", async () => {
    renderSection(undefined, { "platform.subscriptions.suspend": { data: subscriptionDetails() } });
    const dialog = await openDialog(words.suspend.action, words.suspend.title);
    await fill(dialog, words.reason.label, "Chargeback");
    await userEvent.click(within(dialog).getByRole("button", { name: words.suspend.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.suspend")).toEqual([{ organizationId, reason: "Chargeback" }]);
    });
  });

  const suspendedByHand = {
    subscription: subscriptionDetails({
      status: "suspended",
      access: "export_only",
      manualSuspension: { at: "2026-10-16T05:00:00.000Z", by: null, reason: "Chargeback" },
    }),
    payments: [],
  };

  it("shows a suspension made by hand, which support can't lift", () => {
    renderSection(suspendedByHand);
    expect(valueOf(words.suspendedByHand)).toHaveTextContent("On 16 Oct: Chargeback");
    expect(screen.queryByRole("button", { name: words.suspend.action })).toBeNull();
    expect(screen.queryByRole("button", { name: words.liftSuspension.action })).toBeNull();
  });

  it("lets a super admin lift a suspension made by hand, with a reason", async () => {
    renderSection(
      suspendedByHand,
      { "platform.subscriptions.liftSuspension": { data: subscriptionDetails() } },
      platformStaff("super-admin"),
    );
    const dialog = await openDialog(words.liftSuspension.action, words.liftSuspension.title);
    await fill(dialog, words.reason.label, "Paid in full");
    await userEvent.click(within(dialog).getByRole("button", { name: words.liftSuspension.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.liftSuspension")).toEqual([{ organizationId, reason: "Paid in full" }]);
    });
  });

  it("cancels after a reason", async () => {
    renderSection(undefined, { "platform.subscriptions.cancel": { data: subscriptionDetails() } });
    const dialog = await openDialog(words.cancel.action, words.cancel.title);
    await userEvent.click(within(dialog).getByRole("button", { name: words.cancel.submit }));
    expect(await within(dialog).findByText(words.problems.required)).toBeVisible();
    await fill(dialog, words.reason.label, "Closed the business");
    await userEvent.click(within(dialog).getByRole("button", { name: words.cancel.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.cancel")).toEqual([{ organizationId, reason: "Closed the business" }]);
    });
  });

  it("offers neither a suspension nor a cancel once cancelled, but still the paid-through day", () => {
    renderSection({ subscription: subscriptionDetails({ status: "cancelled", access: "locked" }), payments: [] });
    expect(valueOf(words.status)).toHaveTextContent(messages.console.status.cancelled);
    expect(screen.queryByRole("button", { name: words.suspend.action })).toBeNull();
    expect(screen.queryByRole("button", { name: words.cancel.action })).toBeNull();
    expect(screen.getByRole("button", { name: words.paidThrough.action })).toBeVisible();
  });

  it("offers no trial's end outside a trial, even suspended by hand", () => {
    renderSection();
    expect(screen.queryByRole("button", { name: words.trialEnd.action })).toBeNull();
    cleanup();
    renderSection(suspendedByHand);
    expect(screen.queryByRole("button", { name: words.trialEnd.action })).toBeNull();
  });

  it("offers the trial's end while the trial lasts, a trial suspended by hand included, as the api decides", () => {
    const trialSuspended = subscriptionDetails({
      status: "suspended",
      access: "export_only",
      recorded: { status: "trial", since: "2026-10-01" },
      manualSuspension: { at: "2026-10-16T05:00:00.000Z", by: null, reason: "Chargeback" },
      trialEndsOn: "2099-12-31",
      paidThrough: null,
    });
    renderSection({ subscription: trialSuspended, payments: [] });
    expect(screen.getByRole("button", { name: words.trialEnd.action })).toBeVisible();
  });

  it("keeps a change's dialog open while it is sent, then closes it and says it is done", async () => {
    const held = heldAnswer({ data: subscriptionDetails() });
    renderSection(undefined, { "platform.subscriptions.suspend": held.answer });
    const dialog = await openDialog(words.suspend.action, words.suspend.title);
    await fill(dialog, words.reason.label, "Chargeback");
    await userEvent.click(within(dialog).getByRole("button", { name: words.suspend.submit }));
    expect(await within(dialog).findByRole("button", { name: words.suspend.submitting })).toBeDisabled();
    // Nothing closes it meanwhile: Escape does nothing, and there is no close button to press.
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: words.suspend.title })).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: messages.common.close })).toBeNull();
    held.release();
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(toast.success).toHaveBeenCalledWith(words.suspend.done);
  });

  it("moves a trial's end, and keeps a refusal's sentence in the dialog", async () => {
    const trial = subscriptionDetails({ status: "trial", trialEndsOn: "2026-10-20", paidThrough: null });
    renderSection(
      { subscription: trial, payments: [] },
      {
        "platform.subscriptions.setTrialEnd": { status: 400, reason: "TRIAL_END_IN_PAST" },
      },
    );
    const dialog = await openDialog(words.trialEnd.action, words.trialEnd.title);
    expect(within(dialog).getByLabelText(words.trialEnd.trialEndsOn)).toHaveAccessibleName(
      `${words.trialEnd.trialEndsOn} 20/10/2026`,
    );
    await userEvent.click(within(dialog).getByRole("button", { name: words.trialEnd.submit }));
    expect(await within(dialog).findByText(messages.errors.reasons.TRIAL_END_IN_PAST)).toBeVisible();
    // Closed and opened again, it starts afresh: the refusal was the last try's.
    await userEvent.keyboard("{Escape}");
    const again = await openDialog(words.trialEnd.action, words.trialEnd.title);
    expect(within(again).queryByText(messages.errors.reasons.TRIAL_END_IN_PAST)).toBeNull();
  });

  it("starts a change of plan from the current one, while it is on sale", async () => {
    renderSection(undefined, { "platform.plans.list": { data: [growth, pro] } });
    const dialog = await openDialog(words.changePlan.action, words.changePlan.title);
    expect(await within(dialog).findByRole("combobox", { name: onSale.plan })).toHaveTextContent(/^Growth/);
    expect(within(dialog).getByRole("radio", { name: "Monthly, ₹2,500 before GST" })).toBeChecked();
  });

  it("changes the plan to another on sale, on a cycle it is sold on, the current one no longer sold", async () => {
    renderSection(undefined, {
      "platform.plans.list": { data: [pro] },
      "platform.subscriptions.changePlan": { data: subscriptionDetails() },
    });
    const dialog = await openDialog(words.changePlan.action, words.changePlan.title);
    const plan = await within(dialog).findByRole("combobox", { name: onSale.plan });
    expect(plan).toHaveTextContent(onSale.planPlaceholder);
    expect(within(dialog).queryByRole("radiogroup")).toBeNull();
    await userEvent.click(plan);
    await userEvent.click(await screen.findByRole("option", { name: /Pro/ }));
    expect(within(dialog).getByRole("radio", { name: "Yearly, ₹50,000 before GST" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: words.changePlan.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.changePlan")).toEqual([
        { organizationId, planId: "0199a000-0000-7000-8000-0000000000c2", billingCycle: "yearly" },
      ]);
    });
  });

  it("sets the overrides: extra seats, an agreed price and a module switched on early", async () => {
    renderSection(undefined, { "platform.subscriptions.setOverrides": { data: subscriptionDetails() } });
    const dialog = await openDialog(words.overrides.action, words.overrides.title);
    await userEvent.clear(within(dialog).getByLabelText(words.overrides.extraSeats));
    await fill(dialog, words.overrides.extraSeats, "2");
    await fill(dialog, words.overrides.customPrice.monthly, "1999");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: words.modules.crm }));
    await userEvent.click(within(dialog).getByRole("button", { name: words.overrides.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.setOverrides")).toEqual([
        { organizationId, extraSeats: 2, customPricePaise: 199_900, extraModules: ["crm"] },
      ]);
    });
  });
});
