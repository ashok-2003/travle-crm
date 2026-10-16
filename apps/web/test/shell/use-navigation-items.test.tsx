// The shell's navigation asks for the plan's modules (subscription.get) and hides what the plan lacks; until the
// subscription is known it hides nothing, as the api still refuses whatever the plan doesn't allow.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { visibleNavigationItems } from "@/shell/navigation";
import { useNavigationItems } from "@/shell/use-navigation-items";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";

const visible = vi.hoisted(() => vi.fn<typeof visibleNavigationItems>(() => []));
vi.mock(import("@/shell/navigation"), async (original) => ({ ...(await original()), visibleNavigationItems: visible }));

function Items() {
  useNavigationItems();
  return <p>items</p>;
}

/** The modules the navigation was last asked to keep to. */
const modulesAsked = () => visible.mock.lastCall?.[1];

afterEach(() => {
  vi.unstubAllGlobals();
  visible.mockClear();
});

describe("useNavigationItems", () => {
  it("passes the plan's modules to the navigation", async () => {
    renderWithApi(<Items />, newQueryClient({ ...paidSubscription, modules: ["crm", "quotes"] }));
    await screen.findByText("items");
    expect(modulesAsked()).toEqual(["crm", "quotes"]);
  });

  it("passes no modules while the subscription is unknown, so nothing is hidden for the plan", async () => {
    stubApi({});
    renderWithApi(<Items />, newQueryClient(null));
    await screen.findByText("items");
    expect(visible).toHaveBeenCalled();
    expect(modulesAsked()).toBeUndefined();
  });
});
