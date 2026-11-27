// Plan & billing: the plan and its paid-through day, each limit with what is used, the payments, and how to renew; and
// its refusal when the api refuses it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";
import { PlanScreen } from "@/settings/plan/plan-screen";
import { MeProvider } from "@/session/me-context";
import { stubApi, type Answer } from "../support/api-stub";
import { screenIs } from "../organization/render";
import { member } from "../support/members";

const billing = {
  planName: "Growth",
  status: "active",
  paidThrough: "2027-02-26",
  seats: { limit: 6, used: 4 },
  whatsappNumbers: { limit: 2, used: 1 },
  storageBytes: { limit: 5_368_709_120, used: 1_073_741_824 },
  aiCredits: { limit: 20_000, used: 1_234 },
  payments: [
    { paidOn: "2026-11-26", amountPaise: 1_250_000_00, paidThrough: "2027-02-26", reference: "UTR 400000000001" },
    { paidOn: "2026-08-26", amountPaise: 800_000, paidThrough: "2026-11-26", reference: null },
  ],
};

function renderScreen(answer: Answer = { data: billing }) {
  stubApi({ "subscription.billing": answer, "subscription.get": { status: 404 } });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          <MeProvider me={member({ isOwner: true })}>
            <PlanScreen />
          </MeProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanScreen", () => {
  it("lists the plan, the use of each limit with Indian grouping, and the payments", async () => {
    renderScreen();
    expect(await screen.findByText("Growth")).toBeVisible();
    expect(screen.getByText("26 Feb 2027")).toBeVisible();
    expect(screen.getByText("4 of 6")).toBeVisible();
    expect(screen.getByText("1 of 2")).toBeVisible();
    expect(screen.getByText("1 GB of 5 GB")).toBeVisible();
    expect(screen.getByText("1,234 of 20,000")).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    const first = screen.getByRole("row", { name: /UTR 400000000001/ });
    expect(within(first).getByText("₹12,50,000")).toBeVisible();
    const second = screen.getByRole("row", { name: /₹8,000/ });
    expect(within(second).getByText("26 Aug")).toBeVisible();
  });

  it("says when no payment is recorded yet, and keeps the way to renew", async () => {
    renderScreen({ data: { ...billing, payments: [] } });
    expect(await screen.findByText(messages.planBilling.payments.none)).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: messages.subscription.locked.contactHeading })).toBeVisible();
  });

  it("says why, with Try again, when the api refuses it", async () => {
    renderScreen({ status: 403, reason: "MISSING_PERMISSION" });
    expect(await screen.findByRole("button", { name: messages.common.tryAgain })).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
