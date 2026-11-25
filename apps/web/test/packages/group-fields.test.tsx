// The group-trip fields, now split between two sections of the trip's page: Prices & dates holds the kind, room types,
// days, months, seats, advance and start city, and Details & rules the pickup points and GST, each for a group trip
// only, each sent alone. Clearing the advance of the only package a switched-on AI agent sells warns that the agent then
// answers no chat.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DetailsSection } from "@/packages/section-details";
import { PricesSection } from "@/packages/section-prices";
import { messages } from "@/i18n/messages";
import { lastInputTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { aPackage } from "./detail";

const words = messages.packages.form;
const sections = messages.packages.sections;
const editPrices = sections.editNamed.replace("{section}", sections.prices.title);
const editDetails = sections.editNamed.replace("{section}", sections.details.title);

describe("the group fields of Prices & dates", () => {
  it("appear only for a group package", async () => {
    stubApi({});
    const { unmount } = renderScreen(<PricesSection detail={aPackage()} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: editPrices }));
    expect(screen.queryByRole("group", { name: words.roomTypes })).toBeNull();
    expect(screen.queryByLabelText(words.startCity)).toBeNull();
    unmount();
    renderScreen(<PricesSection detail={aPackage({ kind: "group" })} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: editPrices }));
    expect(screen.getByRole("group", { name: words.roomTypes })).toBeTruthy();
    expect(screen.getByLabelText(words.startCity)).toBeTruthy();
  });

  it("turning a package into a group trip shows them", async () => {
    stubApi({});
    renderScreen(<PricesSection detail={aPackage()} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: editPrices }));
    await userEvent.click(screen.getByRole("radio", { name: words.kinds.group }));
    expect(screen.getByLabelText(words.startCity)).toBeTruthy();
  });

  it("sends the chosen room types and the typed start city, and only the section's fields", async () => {
    stubApi({ "packages.updatePart": { data: null } });
    renderScreen(<PricesSection detail={aPackage({ kind: "group" })} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: editPrices }));
    await userEvent.click(screen.getByRole("button", { name: words.roomTypeNames.double }));
    await userEvent.type(screen.getByLabelText(words.startCity), "Delhi");
    await userEvent.click(screen.getByRole("button", { name: sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    const sent = lastInputTo("packages.updatePart") as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      "advancePerPersonPaise",
      "departureMonths",
      "kind",
      "packageId",
      "roomTypes",
      "seatsPerDeparture",
      "startCity",
      "weeklyDays",
    ]);
    expect(sent).toMatchObject({ kind: "group", roomTypes: ["double"], startCity: "Delhi" });
  });
});

describe("the group fields of Details & rules", () => {
  it("pickup points and GST show for a group trip only, and are sent with the section's other fields", async () => {
    stubApi({ "packages.updatePart": { data: null } });
    const { unmount } = renderScreen(<DetailsSection detail={aPackage()} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: editDetails }));
    expect(screen.queryByRole("switch", { name: words.pricesIncludeGst })).toBeNull();
    expect(screen.queryByLabelText(words.pickupPoints)).toBeNull();
    unmount();
    renderScreen(<DetailsSection detail={aPackage({ kind: "group" })} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: editDetails }));
    await userEvent.click(screen.getByRole("switch", { name: words.pricesIncludeGst }));
    await userEvent.type(screen.getByLabelText(words.pickupPoints), "Noida");
    await userEvent.click(screen.getByRole("button", { name: sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    const sent = lastInputTo("packages.updatePart") as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      "cancellationNotes",
      "defaultTravellerLevel",
      "exclusions",
      "inclusions",
      "notes",
      "packageId",
      "pickupPoints",
      "pricesIncludeGst",
    ]);
    expect(sent).toMatchObject({ pricesIncludeGst: false, pickupPoints: "Noida", defaultTravellerLevel: null });
  });
});

describe("the advance of the only package the AI agent sells", () => {
  const onSale = aPackage({ kind: "group", sellable: true, sellGaps: [], advancePerPersonPaise: 200_000 });
  /** The agent's setup as the api says: on or off, with this many packages it may sell. */
  const setup = (on: boolean, count: number) => ({
    steps: [{ key: "packages", done: count > 0, optional: false, count, total: 0 }],
    ready: true,
    on,
    pausedBySupport: false,
  });
  /** Clears the advance once the agent's setup has loaded. */
  const clearAdvance = async (on: boolean, count: number) => {
    const { calls } = stubApi({ "ai.agentSetup": { data: setup(on, count) } });
    const { queryClient } = renderScreen(<PricesSection detail={onSale} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: editPrices }));
    await waitFor(() => {
      expect(calls).toContain("ai.agentSetup");
      expect(queryClient.isFetching()).toBe(0);
    });
    await userEvent.clear(screen.getByLabelText(words.advancePerPerson));
  };

  it("warns that the agent stops answering every chat", async () => {
    await clearAdvance(true, 1);
    expect(await screen.findByText(words.advanceOnlyOnSale)).toBeVisible();
  });

  it("says nothing while another package is on sale", async () => {
    await clearAdvance(true, 2);
    expect(screen.queryByText(words.advanceOnlyOnSale)).toBeNull();
  });

  it("says nothing while the agent is off", async () => {
    await clearAdvance(false, 1);
    expect(screen.queryByText(words.advanceOnlyOnSale)).toBeNull();
  });
});
