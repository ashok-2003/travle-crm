// The package editor's destination picker: a name the agency's list hasn't got exactly (any case, trimmed) can be added,
// as on the lead form, and saving the package sends it to packages.update, which finds or adds it.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/messages";
import { PackageForm } from "@/packages/package-form";
import { lastInputTo, renderScreen } from "../leads/screen";
import { stubApi } from "../support/api-stub";
import { aPackage } from "./detail";

const words = messages.packages.form;
const picker = messages.leads.form.destination;
const addOption = (name: string) => picker.add.replace("{name}", name);

/** Opens the destination picker of a package form, over a list holding Kedarnath, and types into its search. */
async function typeDestination(typed: string) {
  stubApi({
    "destinations.search": { data: [{ id: "0190a000-0000-7000-8000-0000000000d1", name: "Kedarnath" }] },
    "packages.update": { data: null },
  });
  renderScreen(<PackageForm detail={aPackage({ priceDisplay: "on_enquiry" })} />, { width: "wide" });
  await userEvent.click(screen.getByRole("combobox", { name: words.destination }));
  await userEvent.type(await screen.findByPlaceholderText(picker.searchOrAdd), typed);
}

describe("the package editor's destination picker", () => {
  it("offers to add a name the list hasn't got, and saving sends it to be added", async () => {
    await typeDestination(" Spiti ");
    await userEvent.click(await screen.findByRole("option", { name: addOption("Spiti") }));
    expect(screen.getByRole("combobox", { name: words.destination })).toHaveTextContent("Spiti");
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.update")).toMatchObject({ destinationId: null, newDestinationName: "Spiti" });
    });
  });

  it("offers no Add for a name on the list in another case, only the destination itself, sent by its id", async () => {
    await typeDestination("kedarnath");
    const kedarnath = await screen.findByRole("option", { name: "Kedarnath" });
    expect(screen.queryByRole("option", { name: addOption("kedarnath") })).toBeNull();
    await userEvent.click(kedarnath);
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await waitFor(() => {
      expect(lastInputTo("packages.update")).toMatchObject({ destinationId: "0190a000-0000-7000-8000-0000000000d1" });
    });
    expect(lastInputTo("packages.update")).not.toHaveProperty("newDestinationName");
  });
});
