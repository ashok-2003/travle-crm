// Page & files: its form sends only the page's fields, an address made from the name when the trip has none, and the
// From price typed.
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

describe("Page & files", () => {
  it("saves exactly the page's fields: the address, summary, highlights and the price visitors see", async () => {
    stubApi({ "packages.updatePart": { data: null } });
    const trip = aPackage({ slug: null, priceDisplay: "on_enquiry", fromPricePaise: null, highlights: ["Helicopter"] });
    renderScreen(<PageSection detail={trip} />, { width: "wide" });
    await userEvent.click(
      screen.getByRole("button", { name: sections.editNamed.replace("{section}", sections.page.title) }),
    );
    // A trip with no address starts from one made of its name.
    expect(screen.getByLabelText(words.slug)).toHaveValue("kedarnath-6-days");
    await userEvent.type(screen.getByLabelText(words.summary), "Six days to the temple.");
    await userEvent.click(screen.getByRole("radio", { name: words.priceFrom }));
    await userEvent.type(screen.getByLabelText(words.fromPrice), "5999");
    await userEvent.click(screen.getByRole("button", { name: sections.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.updatePart")).toBeDefined();
    });
    const sent = lastInputTo("packages.updatePart") as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      "fromPricePaise",
      "highlights",
      "packageId",
      "priceDisplay",
      "slug",
      "summary",
    ]);
    expect(sent).toEqual({
      packageId: trip.id,
      slug: "kedarnath-6-days",
      summary: "Six days to the temple.",
      highlights: ["Helicopter"],
      priceDisplay: "from",
      fromPricePaise: 599_900,
    });
  });

  it("holds the fields still while the section saves", async () => {
    const save = heldAnswer({ data: null });
    stubApi({ "packages.updatePart": save.answer });
    renderScreen(<PageSection detail={aPackage({ slug: null })} />, { width: "wide" });
    await userEvent.click(
      screen.getByRole("button", { name: sections.editNamed.replace("{section}", sections.page.title) }),
    );
    await userEvent.click(screen.getByRole("button", { name: sections.save }));
    await waitFor(() => {
      expect(screen.getByLabelText(words.summary)).toBeDisabled();
    });
    save.release();
  });
});
