// "Draft packages from your documents" on Settings, AI: find the trips the documents describe, each with its sources.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DraftPackagesSection } from "@/ai/drafts/draft-packages-section";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { draft, line } from "./package-draft-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const trip = (ref: string, name: string) => ({
  ref,
  name,
  placeWords: "Spiti",
  destinationId: null,
  destinationName: "Spiti Valley",
  nights: 7,
  evidence: [line("L1", "Spiti Winter Expedition 7N/8D"), line("L2", "Rates", "Rate email")],
});

function render(answers: Record<string, never> | Parameters<typeof stubApi>[0]) {
  screenIs("wide");
  stubApi(answers);
  const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "ai"] as never });
  renderWithApi(<DraftPackagesSection />, queryClient, member({ permissions: ["ai:suggest", "quotes:edit"] }));
}

describe("Draft packages from your documents", () => {
  it("lists the found trips with their sources", async () => {
    const user = userEvent.setup();
    render({
      "ai.packageDrafts.find": {
        data: {
          fillId: draft.fillId,
          trips: [trip("t1", "Spiti Winter 7N"), trip("t2", "Ladakh 6N")],
          parts: [],
          readPart: null,
        },
      },
    });
    await user.click(await screen.findByRole("button", { name: "Find trips" }));
    expect(await screen.findByText("Spiti Winter 7N")).toBeInTheDocument();
    expect(screen.getByText("Ladakh 6N")).toBeInTheDocument();
    expect(screen.getAllByText(/Spiti brochure, Rate email/).length).toBe(2);
    expect(screen.getAllByRole("button", { name: /^Draft / })).toHaveLength(2);
  });

  it("offers the parts first and finds nothing until one is chosen", async () => {
    const user = userEvent.setup();
    const api = stubApi({
      "ai.packageDrafts.find": {
        data: {
          fillId: null,
          trips: [],
          parts: [
            { ref: "a", label: "Spiti brochure, part 1" },
            { ref: "b", label: "Spiti brochure, part 2" },
          ],
          readPart: null,
        },
      },
    });
    screenIs("wide");
    const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "ai"] as never });
    renderWithApi(<DraftPackagesSection />, queryClient, member({ permissions: ["ai:suggest", "quotes:edit"] }));
    await user.click(await screen.findByRole("button", { name: "Find trips" }));
    const choose = await screen.findByRole("radio", { name: "Spiti brochure, part 2" });
    expect(screen.getByRole("button", { name: "Find trips in this part" })).toBeDisabled();
    await user.click(choose);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Find trips in this part" })).toBeEnabled();
    });
    expect(api.calls).toEqual(["ai.packageDrafts.find"]);
  });
});
