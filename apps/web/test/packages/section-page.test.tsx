// Page and AI: its form sends only the page's fields, and the From price only for a custom trip (a group trip's is worked out).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { PageSection } from "@/packages/section-page";
import { lastInputTo, renderScreen } from "../leads/screen";
import { heldAnswer, stubApi } from "../support/api-stub";
import { aPackage } from "./detail";

const words = messages.packages.form;
const sections = messages.packages.sections;
const edit = () => screen.getByRole("button", { name: sections.editNamed.replace("{section}", sections.page.title) });

describe("Page and AI", () => {
  it("saves a custom trip's summary, highlights, the price visitors see and its From price", async () => {
    stubApi({ "packages.updatePart": { data: null } });
    const trip = aPackage({ priceDisplay: "on_enquiry", fromPricePaise: null, highlights: ["Helicopter"] });
    renderScreen(<PageSection detail={trip} />, { width: "wide" });
    await userEvent.click(edit());
    await userEvent.type(screen.getByLabelText(words.summary), "Six days to the temple.");
    await userEvent.click(screen.getByRole("radio", { name: words.priceFrom }));
    await userEvent.type(screen.getByLabelText(words.fromPrice), "5999");
    expect(screen.getByRole("button", { name: words.calculate })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    expect(lastInputTo("packages.updatePart")).toEqual({
      packageId: trip.id,
      summary: "Six days to the temple.",
      highlights: ["Helicopter"],
      priceDisplay: "from",
      fromPricePaise: 599_900,
    });
  });

  it("gives a group trip no From price to type and never sends one", async () => {
    stubApi({ "packages.updatePart": { data: null } });
    const trip = aPackage({ kind: "group", fromPricePaise: 599_900 });
    renderScreen(<PageSection detail={trip} />, { width: "wide" });
    await userEvent.click(edit());
    expect(screen.queryByLabelText(words.fromPrice)).toBeNull();
    // A group trip honours the choice: its From is worked out, or "Price on enquiry".
    expect(screen.getByRole("radio", { name: words.priceFromWorkedOut })).toBeTruthy();
    expect(screen.getByRole("radio", { name: words.priceOnEnquiry })).toBeTruthy();
    expect(screen.queryByRole("button", { name: words.calculate })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    expect(Object.keys(lastInputTo("packages.updatePart") as object).sort()).toEqual([
      "highlights",
      "packageId",
      "priceDisplay",
      "summary",
    ]);
  });

  it("holds the fields still while the section saves", async () => {
    const save = heldAnswer({ data: null });
    stubApi({ "packages.updatePart": save.answer });
    renderScreen(<PageSection detail={aPackage()} />, { width: "wide" });
    await userEvent.click(edit());
    await userEvent.click(screen.getByRole("button", { name: sections.save }));
    await waitFor(() => {
      expect(screen.getByLabelText(words.summary)).toBeDisabled();
    });
    save.release();
  });
});
