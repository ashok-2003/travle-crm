// "AI can sell" on a package: off with the gaps in words until the package is ready.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SellCard } from "@/packages/sell-card";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { member } from "../support/members";
import { aPackage } from "./detail";

const words = messages.packages.sell;

describe("SellCard", () => {
  it("the switch is off with the gaps listed until the package is ready", () => {
    renderWithApi(
      <SellCard detail={aPackage({ kind: "group", sellGaps: ["room_types", "advance"] })} />,
      newQueryClient(),
    );
    const toggle = screen.getByRole("switch", { name: words.label });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(words.gaps.room_types)).toBeTruthy();
    expect(screen.getByText(words.gaps.advance)).toBeTruthy();
    expect(toggle.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("links each gap to where it is added", () => {
    const gaps = ["room_types", "prices", "advance", "departures", "payment_details"] as const;
    renderWithApi(<SellCard detail={aPackage({ kind: "group", sellGaps: [...gaps] })} />, newQueryClient());
    expect(screen.getByRole("link", { name: words.gaps.room_types })).toHaveAttribute("href", "#group-details");
    expect(screen.getByRole("link", { name: words.gaps.prices })).toHaveAttribute("href", "#package-seasons");
    expect(screen.getByRole("link", { name: words.gaps.advance })).toHaveAttribute("href", "#group-details");
    expect(screen.getByRole("link", { name: words.gaps.departures })).toHaveAttribute("href", "#package-departures");
    expect(screen.getByRole("link", { name: words.gaps.payment_details })).toHaveAttribute(
      "href",
      "/ai-agent?tab=setup#step-payment",
    );
  });

  it("says to add the payment QR, on the AI agent page", () => {
    renderWithApi(<SellCard detail={aPackage({ kind: "group", sellGaps: ["payment_details"] })} />, newQueryClient());
    expect(words.gaps.payment_details).toBe("Add your payment QR");
    expect(screen.getByRole("link", { name: words.gaps.payment_details })).toHaveAttribute(
      "href",
      "/ai-agent?tab=setup#step-payment",
    );
  });

  it("turns on when nothing is missing", async () => {
    const api = fakeApi();
    renderWithApi(<SellCard detail={aPackage({ kind: "group" })} />, newQueryClient());
    await userEvent.click(screen.getByRole("switch", { name: words.label }));
    expect(api.last().path).toBe("packages.setSellable");
    expect(api.last().input).toEqual({ packageId: aPackage().id, sellable: true });
  });

  it("can always be turned off", () => {
    renderWithApi(
      <SellCard detail={aPackage({ kind: "group", sellable: true, sellGaps: ["prices"] })} />,
      newQueryClient(),
    );
    expect(screen.getByRole("switch", { name: words.label }).hasAttribute("disabled")).toBe(false);
  });

  it("shows the gaps and says the AI will not sell while it is on", () => {
    renderWithApi(
      <SellCard detail={aPackage({ kind: "group", sellable: true, sellGaps: ["prices"] })} />,
      newQueryClient(),
    );
    expect(screen.getByText(words.gaps.prices)).toBeTruthy();
    expect(screen.getByText(words.stillNeeds)).toBeTruthy();
    // Switched on is not offered: never "may offer" above "will not sell".
    expect(screen.getByText(words.off)).toBeTruthy();
    expect(screen.queryByText(words.on)).toBeNull();
  });

  it("says the AI may offer a package switched on with nothing missing", () => {
    renderWithApi(<SellCard detail={aPackage({ kind: "group", sellable: true })} />, newQueryClient());
    expect(screen.getByText(words.on)).toBeTruthy();
  });

  it("is disabled and described by the hint when the subscription refuses changes", () => {
    renderWithApi(
      <SellCard detail={aPackage({ kind: "group" })} />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
    );
    const toggle = screen.getByRole("switch", { name: words.label });
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(toggle.getAttribute("aria-describedby")).toBeTruthy();
    expect(toggle.getAttribute("aria-describedby")).toContain("-write");
  });

  it("says who manages it to a member without settings access", () => {
    renderWithApi(<SellCard detail={aPackage({ kind: "group" })} />, newQueryClient(), member({ permissions: [] }));
    expect(screen.getByText(words.managerOnly)).toBeTruthy();
    expect(screen.getByRole("switch", { name: words.label }).hasAttribute("disabled")).toBe(true);
  });
});
