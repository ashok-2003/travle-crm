// The AI's buttons come with their form (owner feedback, 2026-11-02): with the agency's switch already in the cache (the shell asked
// for it, or a saved copy restored it) the button is in the first render, with no request; while the plan or the switch is still
// unknown its place is kept so nothing below moves; and without the module, the permission or the switch it is not there.
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@travel-crm/api";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createApiClient } from "@/data/trpc";
import { useAiAvailability } from "@/ai/use-ai";
import { Button } from "@/components/ui/button";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";

function Probe() {
  const state = useAiAvailability();
  return state === "on" ? <Button variant="ai">Fill with AI</Button> : <p>{state}</p>;
}

function cached(enabled: boolean | null, modules: string[] = ["crm", "ai"]) {
  screenIs("wide");
  const queryClient = newQueryClient({ ...paidSubscription, modules: modules as never });
  if (enabled !== null) {
    const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
    queryClient.setQueryData(trpc.ai.status.queryKey(), { enabled });
  }
  return queryClient;
}

describe("the AI's buttons on first paint", () => {
  it("shows the button in the first render when the switch is cached, in the AI violet", () => {
    renderWithApi(<Probe />, cached(true), member({ permissions: ["ai:suggest"] }));
    const button = screen.getByRole("button", { name: "Fill with AI" });
    expect(button).toHaveAttribute("data-variant", "ai");
    expect(button.className).toContain("bg-people");
  });

  it("keeps the place (loading) while the switch is unknown, and shows nothing without the module, permission or switch", () => {
    renderWithApi(<Probe />, cached(null), member({ permissions: ["ai:suggest"] }));
    expect(screen.getByText("loading")).toBeInTheDocument();
    for (const [queryClient, permissions] of [
      [cached(false), ["ai:suggest"]],
      [cached(true, ["crm"]), ["ai:suggest"]],
      [cached(true), []],
    ] as const) {
      const view = render(<div />);
      view.unmount();
      renderWithApi(<Probe />, queryClient, member({ permissions: [...permissions] }));
      expect(screen.queryByRole("button", { name: "Fill with AI" })).toBeNull();
    }
  });
});
