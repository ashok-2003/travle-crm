// The review of a drafted package: every value beside the line it came from, "check this" and "not found" marked, the
// documents' disagreements held until chosen, and nothing saved until "Save as package".
import { createGroupPackageInput, type CreateGroupPackageInput } from "@travel-crm/contracts/ai";
import { z } from "zod";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { DraftReview } from "@/ai/drafts/draft-review";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { aiModules, draft } from "./package-draft-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const warning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: (...args: unknown[]): void => {
      warning(...args);
    },
  },
}));

function render(
  created: { id: string; brochure: "attached" | "failed" | "none" } = { id: "p1", brochure: "none" },
  access: SubscriptionOverview["access"] = "full",
) {
  screenIs("wide");
  const api = stubApi({ "ai.packageDrafts.create": { data: created } });
  const queryClient = newQueryClient({ ...paidSubscription, modules: aiModules, access });
  renderWithApi(
    <DraftReview draft={draft} open onOpenChange={vi.fn()} />,
    queryClient,
    member({ permissions: ["ai:suggest", "quotes:edit"] }),
  );
  return api;
}

/** What the browser sent to the create call, checked against the contract. */
function sentTo(path: string): CreateGroupPackageInput | undefined {
  for (const [input, init] of vi.mocked(fetch).mock.calls) {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes(path)) continue;
    const body = init?.body ?? undefined;
    return typeof body === "string"
      ? createGroupPackageInput.parse(z.record(z.string(), z.unknown()).parse(JSON.parse(body))["0"])
      : undefined;
  }
  return undefined;
}

describe("Draft review", () => {
  it("shows each value's line, marks check this, and holds Save until each alternative is chosen", async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Spiti Winter 7N");
    // The line a value came from, with the document's name.
    expect(within(dialog).getAllByText(/Spiti Winter Expedition 7N\/8D/).length).toBeGreaterThan(0);
    // A figure the line did not print, and a field the documents never say.
    expect(within(dialog).getAllByText("Check this").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("Not found in your documents").length).toBeGreaterThan(0);
    // The documents disagree on the double price: both are shown with their sources.
    expect(within(dialog).getByText(/Double sharing Rs 6,999 per person/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Twin: 7,499 per head/)).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Save as package" });
    expect(save).toBeDisabled();
    expect(within(dialog).getByText(/1 left/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("radio", { name: /₹7,499/ }));
    await waitFor(() => {
      expect(save).toBeEnabled();
    });
  });

  it("saves the edited values and opens the new package", async () => {
    const user = userEvent.setup();
    render({ id: "p1", brochure: "none" });
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Spiti Winter Special");
    await user.click(within(dialog).getByRole("radio", { name: /₹6,999/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save as package" }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/packages/p1");
    });
    const sent = sentTo("ai.packageDrafts.create");
    expect(sent).toMatchObject({
      fillId: draft.fillId,
      name: "Spiti Winter Special",
      destinationName: "Spiti",
      nights: 7,
      roomTypes: ["double", "triple"],
      weeklyDays: [5],
      departureMonths: [12, 1, 2],
      pricesIncludeGst: false,
      advancePerPersonPaise: 500000,
      seasons: [{ label: "Winter", startsOn: "2026-12-01", endsOn: "2027-02-28" }],
    });
    expect(sent?.seasons[0]?.prices).toMatchObject({
      double: 699900,
      triple: 650000,
      single: null,
    });
  });

  it("holds Save described by the subscription's refusal when the agency is read-only", async () => {
    const user = userEvent.setup();
    render({ id: "p1", brochure: "none" }, "read_only");
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /₹6,999/ }));
    const save = within(dialog).getByRole("button", { name: "Save as package" });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription(/read-only|read only/i);
  });

  it("keeps the brochure notice until dismissed and still opens the package", async () => {
    const user = userEvent.setup();
    render({ id: "p2", brochure: "failed" });
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /₹6,999/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save as package" }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/packages/p2");
    });
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("Files card"),
      expect.objectContaining({ duration: Infinity }),
    );
  });

  it("shows a text the contract would refuse on its field and holds Save until it is shortened", async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /₹6,999/ }));
    const save = within(dialog).getByRole("button", { name: "Save as package" });
    await waitFor(() => {
      expect(save).toBeEnabled();
    });
    const summary = within(dialog).getByLabelText("Summary");
    await user.click(summary);
    await user.paste("x".repeat(601));
    await waitFor(() => {
      expect(summary).toBeInvalid();
    });
    expect(within(dialog).getByText("This is too long to save. Shorten it.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.clear(summary);
    await user.paste("A short summary");
    await waitFor(() => {
      expect(save).toBeEnabled();
    });
  });

  it("says a name another package already has on the name field", async () => {
    const user = userEvent.setup();
    const api = render();
    api.answer("ai.packageDrafts.create", { status: 409, reason: "PACKAGE_NAME_TAKEN" });
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: /₹6,999/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save as package" }));
    const name = within(dialog).getByLabelText("Name");
    await waitFor(() => {
      expect(name).toBeInvalid();
    });
    expect(push).not.toHaveBeenCalledWith("/packages/p1");
  });
});
