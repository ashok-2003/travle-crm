// Destinations in Settings (spec 3.6): the agency's own list, alphabetically, searched by part of a name; each renamed,
// a name another destination has refused with its sentence, or merged into another after asking, saying how many leads
// moved to the one kept. Both are changes for settings:manage.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DestinationsScreen } from "@/crm-settings/destinations-screen";
import { Toaster } from "@/components/ui/sonner";
import { messages } from "@/i18n/messages";
import { inputsSentTo } from "../documents/sent";
import { renderAs, screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";

const words = messages.settings.destinations;

const goa = { id: "0199e7a0-0000-7000-8000-0000000000d1", name: "Goa" };
const goaTrip = { id: "0199e7a0-0000-7000-8000-0000000000d2", name: "Goa trip" };
const kashmir = { id: "0199e7a0-0000-7000-8000-0000000000d3", name: "Kashmir" };
const kerala = { id: "0199e7a0-0000-7000-8000-0000000000d4", name: "Kerala" };

beforeEach(() => {
  screenIs("wide");
  // Radix's menus and selects reach for pointer capture and scrolling, which jsdom lacks.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderScreen() {
  return renderAs(
    <>
      <DestinationsScreen />
      <Toaster />
    </>,
  );
}

/** The destinations listed, in order. */
async function listed(): Promise<string[]> {
  const list = await screen.findByRole("list", { name: words.listLabel });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("[data-slot=item-title]")?.textContent ?? "");
}

async function choose(destination: string, action: string) {
  await userEvent.click(screen.getByRole("button", { name: words.actionsFor.replace("{name}", destination) }));
  await userEvent.click(await screen.findByRole("menuitem", { name: action }));
}

describe("DestinationsScreen", () => {
  it("lists destinations alphabetically with search, renames one, and shows DESTINATION_NAME_TAKEN's sentence", async () => {
    const api = stubApi({
      "destinations.search": { data: [goa, goaTrip, kashmir, kerala] },
      "destinations.rename": { status: 409, reason: "DESTINATION_NAME_TAKEN" },
    });
    renderScreen();
    expect(await listed()).toEqual(["Goa", "Goa trip", "Kashmir", "Kerala"]);
    expect(inputsSentTo("destinations.search")[0]).toEqual({ limit: 100 });

    await userEvent.type(screen.getByRole("searchbox", { name: words.search }), "ke");
    await waitFor(() => {
      expect(inputsSentTo("destinations.search")).toContainEqual({ query: "ke", limit: 100 });
    });

    await choose("Kerala", words.rename.action);
    const dialog = await screen.findByRole("dialog", { name: words.rename.title.replace("{name}", "Kerala") });
    const name = within(dialog).getByRole("textbox", { name: words.rename.name });
    expect(name).toHaveValue("Kerala");
    // A blank name is said on the field, and nothing is sent.
    await userEvent.clear(name);
    await userEvent.click(within(dialog).getByRole("button", { name: words.rename.submit }));
    expect(await within(dialog).findByText(words.rename.problems.required)).toBeVisible();
    expect(inputsSentTo("destinations.rename")).toEqual([]);
    // A name another destination has is refused, and said on the field too, once.
    await userEvent.type(name, "Kashmir");
    await userEvent.click(within(dialog).getByRole("button", { name: words.rename.submit }));
    await waitFor(() => {
      expect(name).toHaveAccessibleDescription(messages.errors.reasons.DESTINATION_NAME_TAKEN);
    });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getAllByText(messages.errors.reasons.DESTINATION_NAME_TAKEN)).toHaveLength(1);

    api.answer("destinations.rename", { data: { id: kerala.id, name: "Kerala backwaters" } });
    await userEvent.clear(name);
    await userEvent.type(name, "Kerala backwaters");
    await userEvent.click(within(dialog).getByRole("button", { name: words.rename.submit }));
    expect(await screen.findByText(words.rename.done)).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(inputsSentTo("destinations.rename")).toEqual([
      { destinationId: kerala.id, name: "Kashmir" },
      { destinationId: kerala.id, name: "Kerala backwaters" },
    ]);
  });

  it("says on the name field a name the api refuses as empty or too long", async () => {
    stubApi({
      "destinations.search": { data: [goa] },
      "destinations.rename": { status: 400, reason: "INVALID_DESTINATION_NAME" },
    });
    renderScreen();
    await listed();
    await choose("Goa", words.rename.action);
    const dialog = await screen.findByRole("dialog", { name: words.rename.title.replace("{name}", "Goa") });
    await userEvent.click(within(dialog).getByRole("button", { name: words.rename.submit }));
    const name = within(dialog).getByRole("textbox", { name: words.rename.name });
    await waitFor(() => {
      expect(name).toHaveAccessibleDescription(messages.errors.reasons.INVALID_DESTINATION_NAME);
    });
    expect(within(dialog).getAllByText(messages.errors.reasons.INVALID_DESTINATION_NAME)).toHaveLength(1);
  });

  it("merges one into another after asking, and says how many leads moved", async () => {
    stubApi({
      "destinations.search": { data: [goa, goaTrip, kashmir] },
      "destinations.merge": { data: { leadsMoved: 3 } },
    });
    renderScreen();
    await listed();
    await choose("Goa trip", words.merge.action);
    const dialog = await screen.findByRole("dialog", { name: words.merge.title.replace("{name}", "Goa trip") });
    // It asks which to keep, and says what merging does, before anything is sent.
    expect(within(dialog).getByText(words.merge.description.replace(/\{name\}/g, "Goa trip"))).toBeVisible();
    const keep = within(dialog).getByRole("combobox", { name: words.merge.keep });
    await userEvent.click(keep);
    const options = await screen.findAllByRole("option");
    // Never itself.
    expect(options.map((option) => option.textContent)).toEqual(["Goa", "Kashmir"]);
    await userEvent.click(screen.getByRole("option", { name: "Goa" }));
    expect(inputsSentTo("destinations.merge")).toEqual([]);
    const merge = within(dialog).getByRole("button", { name: words.merge.submit });
    expect(merge.dataset.variant).toBe("destructive");
    await userEvent.click(merge);
    await waitFor(() => {
      expect(inputsSentTo("destinations.merge")).toEqual([{ destinationId: goaTrip.id, intoDestinationId: goa.id }]);
    });
    expect(await screen.findByText("Merged. 3 leads moved to Goa.")).toBeVisible();
  });

  it("says when there are none yet, and when the list didn't load, with Try again", async () => {
    const api = stubApi({ "destinations.search": { data: [] } });
    const first = renderScreen();
    expect(await screen.findByText(words.empty)).toBeVisible();
    first.unmount();

    api.answer("destinations.search", { status: 500 });
    renderScreen();
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("destinations.search", { data: [goa] });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await listed()).toEqual(["Goa"]);
  });
});
