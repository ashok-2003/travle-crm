// The subscription's price as the console shows it: GST is a row only while the policy charges some, and a 3-month
// plan says so; a payment's paid-through day is offered one billing cycle on.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceBreakdown } from "@/console/organizations/subscription/price-breakdown";
import { defaultPaidThrough } from "@/console/organizations/subscription/paid-through-default";
import { messages } from "@/i18n/messages";
import { screenIs } from "../../organization/render";
import { renderConsole } from "../../support/render-console";
import { subscriptionDetails } from "./organization-details";

const words = messages.consoleOrganizations.subscription.price;

describe("PriceBreakdown", () => {
  it("shows GST and the total with it while the policy charges GST", () => {
    screenIs("wide");
    renderConsole(<PriceBreakdown price={subscriptionDetails().price} agreed={false} />);
    expect(screen.getByRole("rowheader", { name: words.gst })).toBeVisible();
    expect(screen.getByText("₹2,950")).toBeVisible();
  });

  it("leaves GST out at 0, the total being the plan's price, and names a 3-month cycle", () => {
    screenIs("wide");
    const price = {
      ...subscriptionDetails().price,
      cycle: "quarterly" as const,
      cgstPaise: 0,
      sgstPaise: 0,
      gstPaise: 0,
      totalPaise: 250_000,
    };
    renderConsole(<PriceBreakdown price={price} agreed={false} />);
    expect(screen.queryByRole("rowheader", { name: words.gst })).toBeNull();
    expect(screen.getByText(words.caption.quarterly)).toBeVisible();
    expect(screen.getByRole("rowheader", { name: words.total.quarterly })).toBeVisible();
  });
});

describe("defaultPaidThrough", () => {
  it("is one month, 3 months or 12 months on, through the day before", () => {
    expect(defaultPaidThrough("monthly", "2026-11-01", null)).toBe("2026-11-30");
    expect(defaultPaidThrough("quarterly", "2026-11-01", null)).toBe("2027-01-31");
    expect(defaultPaidThrough("yearly", "2026-11-01", null)).toBe("2027-10-31");
  });

  it("counts from the day after what is already paid, and from the payment's day when that is past", () => {
    expect(defaultPaidThrough("monthly", "2026-11-20", "2026-11-30")).toBe("2026-12-31");
    expect(defaultPaidThrough("quarterly", "2026-11-20", "2026-10-31")).toBe("2027-02-19");
  });

  it("holds a day that doesn't exist in a shorter month to that month's last day", () => {
    expect(defaultPaidThrough("monthly", "2027-01-31", null)).toBe("2027-02-27");
  });
});
