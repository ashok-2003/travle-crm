// The organization's subscription in the console: its state today beside the recorded one, the plan, dates (as in a
// sentence) and overrides, the price with GST in mono, and the payments; and what support may change, in one Change
// menu beside Record a payment, each change offered only when the api would take it. Lifting a suspension is a super
// admin's. The changes' own dialogs: subscription-changes.test.tsx.
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { subscriptionDetails } from "./organization-details";
import { changesOffered, payment, renderSection, suspendedByHand, valueOf, words } from "./subscription-fixtures";

const names = async () => (await changesOffered()).map((item) => item.textContent);

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    // Dates read as in a sentence, in Figtree, as "since 1 Nov" beside them does.
    expect(valueOf(words.paidThroughOn).querySelector(".numbers")).toBeNull();
    expect(valueOf(words.trialEndsOn)).toHaveTextContent(words.notSet);
    expect(valueOf(words.extraModules)).toHaveTextContent("Quotes");
    const price = screen.getByRole("table", { name: words.price.caption.monthly });
    expect(within(price).getByRole("row", { name: "The plan's price ₹2,500" })).toBeVisible();
    // Before GST only says something new when seats are added; paise only when there are some.
    expect(within(price).queryByRole("row", { name: /^Before GST/ })).toBeNull();
    // One GST row until the platform's own GST state is set, which decides between CGST with SGST, and IGST.
    expect(within(price).getByRole("row", { name: "GST at 18% ₹450" })).toBeVisible();
    expect(within(price).queryByRole("row", { name: /CGST|SGST/ })).toBeNull();
    expect(within(price).getByRole("row", { name: "Total a month ₹2,950" })).toBeVisible();
    expect(within(price).getByText("₹2,950")).toHaveClass("numbers", "text-right");
  });

  it("adds the seats bought and the amount before GST to the price when there are some", () => {
    const price = {
      ...subscriptionDetails().price,
      extraSeats: 2,
      extraSeatsPaise: 50_050,
      subtotalPaise: 300_050,
    };
    renderSection({ subscription: subscriptionDetails({ extraSeats: 2, price }), payments: [] });
    const table = screen.getByRole("table", { name: words.price.caption.monthly });
    expect(within(table).getByRole("row", { name: "2 extra seats ₹500.50" })).toBeVisible();
    expect(within(table).getByRole("row", { name: "Before GST ₹3,000.50" })).toBeVisible();
  });

  it("lists the payments, money received in forest, a voided one with its reason, Void destructive", () => {
    const voided = payment({
      id: "0199a000-0000-7000-8000-0000000000f2",
      voided: { at: "2026-10-02T05:00:00.000Z", by: null, reason: "Entered twice" },
    });
    renderSection({ subscription: subscriptionDetails(), payments: [payment(), voided] });
    const [first, second] = screen.getAllByRole("row").filter((row) => row.textContent.includes("NEFT"));
    expect(within(first ?? document.body).getByText("₹2,950")).toHaveClass("text-money");
    expect(within(first ?? document.body).getByRole("button", { name: /^Void/ })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    expect(within(second ?? document.body).getByText(words.payments.voided)).toBeVisible();
    expect(within(second ?? document.body).getByText("Entered twice")).toBeVisible();
  });

  it("offers its changes in one Change menu beside Record a payment, the destructive ones apart and last", async () => {
    renderSection();
    expect(screen.getByRole("button", { name: words.recordPayment.action })).toHaveAttribute("data-variant", "default");
    const items = await changesOffered();
    expect(items.map((item) => item.textContent)).toEqual([
      words.changePlan.action,
      words.overrides.action,
      words.paidThrough.action,
      words.suspend.action,
      words.cancel.action,
    ]);
    expect(items.slice(-2).map((item) => item.dataset.variant)).toEqual(["destructive", "destructive"]);
  });

  it("shows a suspension made by hand, which support can't lift", async () => {
    renderSection(suspendedByHand);
    expect(valueOf(words.suspendedByHand)).toHaveTextContent("On 16 Oct: Chargeback");
    const offered = await names();
    expect(offered).not.toContain(words.suspend.action);
    expect(offered).not.toContain(words.liftSuspension.action);
  });

  it("offers a super admin the lifting of a suspension made by hand", async () => {
    renderSection(suspendedByHand, {}, platformStaff("super-admin"));
    expect(await names()).toContain(words.liftSuspension.action);
  });

  it("offers neither a suspension nor a cancel once cancelled, but still the paid-through day", async () => {
    renderSection({ subscription: subscriptionDetails({ status: "cancelled", access: "locked" }), payments: [] });
    expect(valueOf(words.status)).toHaveTextContent(messages.console.status.cancelled);
    const offered = await names();
    expect(offered).not.toContain(words.suspend.action);
    expect(offered).not.toContain(words.cancel.action);
    expect(offered).toContain(words.paidThrough.action);
  });

  it("offers no trial's end outside a trial, even suspended by hand", async () => {
    renderSection();
    expect(await names()).not.toContain(words.trialEnd.action);
    cleanup();
    renderSection(suspendedByHand);
    expect(await names()).not.toContain(words.trialEnd.action);
  });

  it("offers the trial's end while the trial lasts, a trial suspended by hand included, as the api decides", async () => {
    const trialSuspended = subscriptionDetails({
      status: "suspended",
      access: "export_only",
      recorded: { status: "trial", since: "2026-10-01" },
      manualSuspension: { at: "2026-10-16T05:00:00.000Z", by: null, reason: "Chargeback" },
      trialEndsOn: "2099-12-31",
      paidThrough: null,
    });
    renderSection({ subscription: trialSuspended, payments: [] });
    expect(await names()).toContain(words.trialEnd.action);
  });
});
