// The review of a drafted package: every value beside the line it came from, "check this" and "not found" marked, the
// documents' disagreements held until chosen, and nothing saved until "Save as package".
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DraftReview } from "@/ai/drafts/draft-review";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { draft } from "./package-draft-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function render(created: { id: string; brochure: "attached" | "failed" | "none" } = { id: "p1", brochure: "none" }) {
  screenIs("wide");
  stubApi({ "ai.packageDrafts.create": { data: created } });
  const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "ai"] as never });
  renderWithApi(
    <DraftReview draft={draft} open onOpenChange={vi.fn()} />,
    queryClient,
    member({ permissions: ["ai:suggest", "quotes:edit"] }),
  );
}

function sentTo(path: string): Record<string, unknown> | undefined {
  for (const [input, init] of vi.mocked(fetch).mock.calls) {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes(path)) continue;
    const body = init?.body ?? undefined;
    return typeof body === "string" ? (JSON.parse(body) as Record<string, Record<string, unknown>>)["0"] : undefined;
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
    expect((sent as { seasons: { prices: Record<string, number | null> }[] }).seasons[0]?.prices).toMatchObject({
      double: 699900,
      triple: 650000,
      single: null,
    });
  });
});
