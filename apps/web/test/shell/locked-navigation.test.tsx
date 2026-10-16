// While the subscription shuts the organization's screens, the navigation offers only Home, which says why, and the
// screens locks.ts keeps open: Staff (and Documents and the files, in Settings) for the suspended Owner, nothing more
// for anyone else. A paid organization offers every destination the role allows.
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNavigationItems } from "@/shell/use-navigation-items";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { member } from "../support/members";

function Items() {
  return (
    <p>
      {useNavigationItems()
        .map((item) => item.key)
        .join(" ")}
    </p>
  );
}

const owner = member({ isOwner: true });
const admin = member({ permissions: ["staff:manage", "roles:manage", "settings:manage", "audit:view"] });
const subscription = (access: SubscriptionOverview["access"]): SubscriptionOverview => ({
  ...paidSubscription,
  status: access === "export_only" ? "suspended" : access === "locked" ? "cancelled" : "active",
  access,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the navigation of a shut organization", () => {
  it("offers every destination the role allows while the subscription is paid", async () => {
    renderWithApi(<Items />, newQueryClient(subscription("full")), owner);
    expect(await screen.findByText("home staff roles settings audit")).toBeVisible();
  });

  it("offers the suspended Owner Home and Staff, and nothing that would show the locked screen", async () => {
    renderWithApi(<Items />, newQueryClient(subscription("export_only")), owner);
    expect(await screen.findByText("home staff")).toBeVisible();
  });

  it("offers anyone else only Home while suspended, and everyone only Home once cancelled", async () => {
    const { unmount } = renderWithApi(<Items />, newQueryClient(subscription("export_only")), admin);
    expect(await screen.findByText("home")).toBeVisible();
    unmount();
    renderWithApi(<Items />, newQueryClient(subscription("locked")), owner);
    expect(await screen.findByText("home")).toBeVisible();
  });
});
