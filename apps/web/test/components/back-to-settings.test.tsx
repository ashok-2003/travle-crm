// The way back to Settings from its sections: there while the settings screen opens, read-only included, and left out
// while the subscription shuts it, so a suspended Owner on Documents or the business files isn't led to the locked
// screen.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackToSettings } from "@/components/back-to-settings";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { member } from "../support/members";

const owner = member({ isOwner: true });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BackToSettings", () => {
  it("leads back to Settings, read-only included", () => {
    renderWithApi(
      <BackToSettings />,
      newQueryClient({ ...paidSubscription, status: "read_only", access: "read_only" }),
      owner,
    );
    expect(screen.getByRole("link", { name: messages.settings.title })).toHaveAttribute("href", routes.settings);
  });

  it("is left out while the settings screen is shut", () => {
    renderWithApi(
      <BackToSettings />,
      newQueryClient({ ...paidSubscription, status: "suspended", access: "export_only" }),
      owner,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
