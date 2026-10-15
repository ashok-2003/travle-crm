// After a step the api insisted on, the person goes on to the next step still pending, or to the ?next= page they
// were sent from (the console sends platform staff with one), and home without one: never to another site.
import type { PendingStep } from "@travel-crm/contracts/identity";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContinueAfterStep } from "@/account/current-person";
import { member } from "../support/members";
import { renderScreen } from "./render";

const navigation = vi.hoisted(() => ({ search: "", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function Done() {
  const continueAfterStep = useContinueAfterStep();
  return <button onClick={() => void continueAfterStep()}>Done</button>;
}

/** me.get answering as the api does, with the step still pending. */
function meAnswers(pendingStep: PendingStep | null): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json([{ result: { data: { ...member(), pendingStep } } }]))),
  );
}

async function finishStep(search: string, pendingStep: PendingStep | null = null): Promise<void> {
  navigation.search = search;
  meAnswers(pendingStep);
  renderScreen(<Done />);
  await userEvent.click(screen.getByRole("button", { name: "Done" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  navigation.replace.mockReset();
});

describe("useContinueAfterStep", () => {
  it("goes home when nothing is pending and no ?next= was given", async () => {
    await finishStep("");
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/");
    });
  });

  it("goes back to the ?next= page when nothing is pending", async () => {
    await finishStep("next=%2Fconsole%2Fplans");
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/console/plans");
    });
  });

  it("goes on to the step still pending, carrying ?next= along", async () => {
    await finishStep("next=%2Fconsole", "SET_UP_TWO_FACTOR");
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/two-factor-setup?next=%2Fconsole");
    });
  });

  it("never follows ?next= to another site", async () => {
    await finishStep("next=%2F%2Fevil.example");
    await vi.waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/");
    });
  });
});
