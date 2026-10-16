// The subscription shuts an organization's screens (spec 7.3): suspended, cancelled or never set up, the screen is
// replaced by what happened and how to reach support, and while suspended the Owner is shown the way to Staff,
// which stays open to them. Until subscription.get answers, and in every other state, the screen shows.
import { brand } from "@travel-crm/brand";
import type { LifecycleAccess, SubscriptionStatus } from "@travel-crm/contracts/subscriptions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";
import { MeProvider } from "@/session/me-context";
import { SubscriptionGate } from "@/subscription/subscription-gate";
import { stubApi, type Answer } from "../support/api-stub";
import { member } from "../support/members";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const { locked } = messages.subscription;

const statusOf: Record<LifecycleAccess, SubscriptionStatus> = {
  full: "active",
  read_only: "read_only",
  export_only: "suspended",
  locked: "cancelled",
};

const subscription = (access: LifecycleAccess): Answer => ({
  data: {
    status: statusOf[access],
    access,
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
  },
});

/** Renders the gate around a stand-in screen at `path`, and waits until subscription.get has answered (or not). */
async function renderGate(answer: Answer, { path = "/", isOwner = false }: { path?: string; isOwner?: boolean } = {}) {
  pathname.current = path;
  const api = stubApi({ "subscription.get": answer });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          <MeProvider me={member({ isOwner })}>
            <SubscriptionGate>
              <p>The screen</p>
            </SubscriptionGate>
          </MeProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  if (answer === "never") return;
  await waitFor(() => {
    expect(api.calls).toContain("subscription.get");
    expect(queryClient.isFetching()).toBe(0);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SubscriptionGate", () => {
  it("shows the screen while the subscription loads, when it can't be read, and while read-only", async () => {
    await renderGate("never");
    expect(screen.getByText("The screen")).toBeVisible();
    await renderGate("offline");
    await renderGate(subscription("read_only"));
    expect(screen.getAllByText("The screen")).toHaveLength(3);
  });

  it("replaces a suspended organization's screens with what happened and how to reach support", async () => {
    await renderGate(subscription("export_only"), { path: "/roles" });
    expect(screen.queryByText("The screen")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: locked.suspended.title })).toBeVisible();
    expect(screen.getByText(locked.suspended.status)).toBeVisible();
    expect(screen.getByRole("link", { name: brand.supportEmail })).toHaveAttribute(
      "href",
      `mailto:${brand.supportEmail}`,
    );
    expect(screen.getByRole("link", { name: "+91 00000 00000" })).toHaveAttribute("href", `tel:${brand.supportPhone}`);
    expect(screen.queryByRole("link", { name: locked.suspended.toStaff })).not.toBeInTheDocument();
  });

  it("points the Owner of a suspended organization to Staff and Documents, which stay open to them", async () => {
    await renderGate(subscription("export_only"), { path: "/settings", isOwner: true });
    expect(screen.getByText(locked.suspended.ownerCanRevoke)).toBeVisible();
    expect(screen.getByRole("link", { name: locked.suspended.toStaff })).toHaveAttribute("href", "/staff");
    expect(screen.getByRole("link", { name: locked.suspended.toDocuments })).toHaveAttribute(
      "href",
      "/settings/documents",
    );
    await renderGate(subscription("export_only"), { path: "/staff", isOwner: true });
    expect(screen.getByText("The screen")).toBeVisible();
  });

  it("shuts a cancelled organization's every screen, the Owner's Staff too", async () => {
    await renderGate(subscription("locked"), { path: "/staff", isOwner: true });
    expect(screen.queryByText("The screen")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: locked.cancelled.title })).toBeVisible();
    expect(screen.queryByRole("link", { name: locked.suspended.toStaff })).not.toBeInTheDocument();
  });

  it("shuts an organization without a subscription", async () => {
    await renderGate({ status: 403, reason: "NO_SUBSCRIPTION" });
    expect(screen.getByRole("heading", { level: 1, name: locked.noSubscription.title })).toBeVisible();
    expect(screen.getByText(locked.noSubscription.status)).toBeVisible();
  });

  it("keeps the person's own account open", async () => {
    await renderGate(subscription("locked"), { path: "/account" });
    expect(screen.getByText("The screen")).toBeVisible();
  });
});
