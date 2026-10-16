// The two-factor requirement as the subscription allows (ADR 0021): requiring it takes access away from whoever can't
// pass it, so a read-only organization may still turn it on; turning it off loosens sign-in, a change, so read-only
// it is shown disabled with the reason.
import type { LifecycleAccess } from "@travel-crm/contracts/subscriptions";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { TwoFactorRequirement } from "@/organization/settings/two-factor-requirement";
import { newQueryClient, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const { reasons } = messages.errors;
const { security } = messages.settings;

/** Renders the switch, and waits until the subscription and the settings have answered. */
async function renderRequirement(access: LifecycleAccess, requireTwoFactor: boolean) {
  stubApi({
    "subscription.get": {
      data: {
        status: access === "full" ? "active" : "read_only",
        access,
        planName: "Growth",
        modules: [],
        trialEndsOn: null,
        paidThrough: null,
        nextChangeOn: null,
        limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
      },
    },
    "settings.get": { data: { requireTwoFactor } },
  });
  const queryClient = newQueryClient(null);
  renderWithApi(<TwoFactorRequirement />, queryClient, member({ isOwner: true }));
  const requirement = await screen.findByRole("switch", { name: security.requireTwoFactor });
  await waitFor(() => {
    expect(queryClient.isFetching()).toBe(0);
  });
  return requirement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the two-factor requirement in each state of the subscription", () => {
  it("can be turned on in a read-only organization", async () => {
    const requirement = await renderRequirement("read_only", false);
    expect(requirement).toBeEnabled();
    expect(screen.getByText(security.requireTwoFactorHint)).toBeVisible();
  });

  it("can't be turned off in a read-only organization, and says why", async () => {
    const requirement = await renderRequirement("read_only", true);
    expect(requirement).toBeDisabled();
    expect(requirement).toHaveAccessibleDescription(reasons.ORGANIZATION_READ_ONLY);
  });

  it("can be turned off by an Owner while the subscription is paid", async () => {
    const requirement = await renderRequirement("full", true);
    expect(requirement).toBeEnabled();
  });
});
