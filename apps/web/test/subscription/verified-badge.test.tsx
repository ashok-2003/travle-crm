// The verified tick beside the agency's name: shown only while the plan is active and paid, named "Verified · <plan>
// plan", with a card that says the plan and the paid-through day, and the way to Plan & billing for whoever may see it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { VerifiedBadge } from "@/subscription/verified-badge";
import { stubApi, type ApiStub } from "../support/api-stub";
import { member } from "../support/members";

const overview = (fields: Record<string, unknown> = {}) => ({
  data: {
    status: "active",
    access: "full",
    planName: "Growth",
    planKey: "growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: "2027-02-26",
    nextChangeOn: "2027-02-27",
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
    ...fields,
  },
});

async function renderBadge(me: SignedInMember, fields: Record<string, unknown> = {}) {
  const api: ApiStub = stubApi({ "subscription.get": overview(fields) });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          <MeProvider me={me}>
            <VerifiedBadge />
          </MeProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  await waitFor(() => {
    expect(api.calls).toContain("subscription.get");
    expect(queryClient.isFetching()).toBe(0);
  });
  return view;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T06:00:00Z"));
  const noop = () => undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VerifiedBadge", () => {
  it("shows a named tick, whose card says the plan and the paid-through day, to a member without billing", async () => {
    await renderBadge(member());
    await userEvent.click(await screen.findByRole("button", { name: "Verified · Growth plan" }));
    expect(screen.getByText("Growth plan")).toBeVisible();
    expect(screen.getByText("Paid till 26 Feb 2027")).toBeVisible();
    expect(screen.queryByRole("link", { name: messages.subscription.verified.seeBilling })).toBeNull();
  });

  it("gives the Owner the way to Plan & billing", async () => {
    await renderBadge(member({ isOwner: true }));
    await userEvent.click(await screen.findByRole("button", { name: "Verified · Growth plan" }));
    expect(screen.getByRole("link", { name: messages.subscription.verified.seeBilling })).toHaveAttribute(
      "href",
      routes.plan,
    );
  });

  it.each([
    ["a trial", { status: "trial", paidThrough: null }],
    ["past due", { status: "past_due" }],
    ["read-only", { status: "read_only", access: "read_only" }],
    ["paid through yesterday", { paidThrough: "2026-11-25" }],
    ["the demo", { planKey: "platform-demo", planName: "Demo" }],
  ])("shows no tick for %s", async (_name, fields) => {
    const { container } = await renderBadge(member({ isOwner: true }), fields);
    expect(container).toBeEmptyDOMElement();
  });
});
