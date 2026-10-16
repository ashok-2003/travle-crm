// Every change to a subscription through subscriptions.*, each in its dialog (from the Change menu, or its own
// button): what it sends, a refusal's sentence kept in the dialog and gone when it opens again, the submit and Cancel
// in its footer, and the dialog held open while the change is sent.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { heldAnswer } from "../../support/api-stub";
import { chooseDay } from "../../support/choose-day";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { organizationId, subscriptionDetails } from "./organization-details";
import { inputsTo as inputsSentTo } from "../../support/render-console";
import {
  fill,
  growth,
  openChange,
  openDialog,
  payment,
  pro,
  renderSection,
  suspendedByHand,
  words,
} from "./subscription-fixtures";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

const onSale = messages.consoleOrganizations.onboard.subscription;

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
  toast.success.mockReset();
});

describe("the subscription's changes", { timeout: 20_000 }, () => {
  it("records a payment, reading the rupees typed", async () => {
    renderSection(undefined, { "platform.subscriptions.recordPayment": { data: payment() } });
    const dialog = await openDialog(words.recordPayment.action, words.recordPayment.title);
    await fill(dialog, words.recordPayment.amount, "2950");
    await chooseDay(words.recordPayment.paidOn, "2026-11-01", dialog);
    await chooseDay(words.recordPayment.paidThrough, "2026-11-30", dialog);
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

  it("suspends with a reason, its last step destructive", async () => {
    renderSection(undefined, { "platform.subscriptions.suspend": { data: subscriptionDetails() } });
    const dialog = await openChange(words.suspend.action, words.suspend.title);
    await fill(dialog, words.reason.label, "Chargeback");
    const submit = within(dialog).getByRole("button", { name: words.suspend.submit });
    expect(submit).toHaveAttribute("data-variant", "destructive");
    await userEvent.click(submit);
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.suspend")).toEqual([{ organizationId, reason: "Chargeback" }]);
    });
  });

  it("lets a super admin lift a suspension made by hand, with a reason", async () => {
    renderSection(
      suspendedByHand,
      { "platform.subscriptions.liftSuspension": { data: subscriptionDetails() } },
      platformStaff("super-admin"),
    );
    const dialog = await openChange(words.liftSuspension.action, words.liftSuspension.title);
    await fill(dialog, words.reason.label, "Paid in full");
    await userEvent.click(within(dialog).getByRole("button", { name: words.liftSuspension.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.liftSuspension")).toEqual([{ organizationId, reason: "Paid in full" }]);
    });
  });

  it("cancels after a reason, and Cancel in the footer leaves without sending", async () => {
    const api = renderSection(undefined, { "platform.subscriptions.cancel": { data: subscriptionDetails() } });
    let dialog = await openChange(words.cancel.action, words.cancel.title);
    await userEvent.click(within(dialog).getByRole("button", { name: messages.common.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.calls).not.toContain("platform.subscriptions.cancel");
    dialog = await openChange(words.cancel.action, words.cancel.title);
    await userEvent.click(within(dialog).getByRole("button", { name: words.cancel.submit }));
    expect(await within(dialog).findByText(words.problems.required)).toBeVisible();
    await fill(dialog, words.reason.label, "Closed the business");
    await userEvent.click(within(dialog).getByRole("button", { name: words.cancel.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.cancel")).toEqual([{ organizationId, reason: "Closed the business" }]);
    });
  });

  it("keeps a change's dialog open while it is sent, then closes it and says it is done", async () => {
    const held = heldAnswer({ data: subscriptionDetails() });
    renderSection(undefined, { "platform.subscriptions.suspend": held.answer });
    const dialog = await openChange(words.suspend.action, words.suspend.title);
    await fill(dialog, words.reason.label, "Chargeback");
    await userEvent.click(within(dialog).getByRole("button", { name: words.suspend.submit }));
    expect(await within(dialog).findByRole("button", { name: words.suspend.submitting })).toBeDisabled();
    // Nothing closes it meanwhile: Escape does nothing, Cancel is off, and there is no close button to press.
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: words.suspend.title })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: messages.common.cancel })).toBeDisabled();
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
      { "platform.subscriptions.setTrialEnd": { status: 400, reason: "TRIAL_END_IN_PAST" } },
    );
    const dialog = await openChange(words.trialEnd.action, words.trialEnd.title);
    expect(within(dialog).getByRole("textbox", { name: words.trialEnd.trialEndsOn })).toHaveValue("20/10/2026");
    await userEvent.click(within(dialog).getByRole("button", { name: words.trialEnd.submit }));
    expect(await within(dialog).findByText(messages.errors.reasons.TRIAL_END_IN_PAST)).toBeVisible();
    // Closed and opened again, it starts afresh: the refusal was the last try's.
    await userEvent.keyboard("{Escape}");
    const again = await openChange(words.trialEnd.action, words.trialEnd.title);
    expect(within(again).queryByText(messages.errors.reasons.TRIAL_END_IN_PAST)).toBeNull();
  });

  it("starts a change of plan from the current one while it is on sale, each plan named alone", async () => {
    renderSection(undefined, { "platform.plans.list": { data: [growth, pro] } });
    const dialog = await openChange(words.changePlan.action, words.changePlan.title);
    expect(await within(dialog).findByRole("combobox", { name: onSale.plan })).toHaveTextContent(/^Growth$/);
    expect(within(dialog).getByRole("radio", { name: "Monthly, ₹2,500 before GST" })).toBeChecked();
  });

  it("changes the plan to another on sale, on a cycle it is sold on, the current one no longer sold", async () => {
    renderSection(undefined, {
      "platform.plans.list": { data: [pro] },
      "platform.subscriptions.changePlan": { data: subscriptionDetails() },
    });
    const dialog = await openChange(words.changePlan.action, words.changePlan.title);
    const plan = await within(dialog).findByRole("combobox", { name: onSale.plan });
    expect(plan).toHaveTextContent(onSale.planPlaceholder);
    expect(within(dialog).queryByRole("radiogroup")).toBeNull();
    await userEvent.click(plan);
    await userEvent.click(await screen.findByRole("option", { name: "Pro" }));
    expect(within(dialog).getByRole("radio", { name: "Yearly, ₹50,000 before GST" })).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: words.changePlan.submit }));
    await vi.waitFor(() => {
      expect(inputsSentTo("subscriptions.changePlan")).toEqual([
        { organizationId, planId: "0199a000-0000-7000-8000-0000000000c2", billingCycle: "yearly" },
      ]);
    });
  });

  it("can't send a change of plan before the plans have loaded", async () => {
    renderSection(undefined, { "platform.plans.list": "never" });
    const dialog = await openChange(words.changePlan.action, words.changePlan.title);
    expect(within(dialog).getByRole("button", { name: words.changePlan.submit })).toBeDisabled();
  });

  it("sets the overrides: extra seats, an agreed price and a module switched on early", async () => {
    renderSection(undefined, { "platform.subscriptions.setOverrides": { data: subscriptionDetails() } });
    const dialog = await openChange(words.overrides.action, words.overrides.title);
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
