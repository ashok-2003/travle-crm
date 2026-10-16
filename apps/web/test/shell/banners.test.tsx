// The banners above every screen: support impersonating the member always shows one (spec 6.1), with the way to stop,
// and so does being offline (DESIGN.md); the subscription shows one in the trial's last week, while payment is due
// (with the day read-only begins, when there is one) and while read-only (spec 7.3), counting days in the
// organization's zone. None shows otherwise.
import { brand } from "@travel-crm/brand";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { Banners } from "@/shell/banners";
import { stubApi, type Answer, type ApiStub } from "../support/api-stub";
import { member } from "../support/members";

const { banners } = messages.shell;
const { banner } = messages.subscription;

const subscription = (
  status: string,
  access: string,
  dates: { trialEndsOn?: string; paidThrough?: string; nextChangeOn?: string } = {},
): Answer => ({
  data: {
    status,
    access,
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
    ...dates,
  },
});

const active = subscription("active", "full", { paidThrough: "2027-10-15", nextChangeOn: "2027-10-16" });

/** Renders the banners and waits until subscription.get has answered. */
async function renderBanners(me: SignedInMember, answer: Answer = active) {
  const api: ApiStub = stubApi({ "subscription.get": answer });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          <MeProvider me={me}>
            <Banners />
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
  // Only the clock is fake, so the query cache's timers still run. 16 Oct 2026, 11:30 am in India.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Banners", () => {
  it("says so while support is signed in as the member", async () => {
    await renderBanners(member({ impersonatedBy: "0199a000-0000-7000-8000-0000000000ad" }));
    // To support, who reads it: whom they are signed in as, and where.
    expect(
      screen.getByText("You're signed in as Asha at Sharma Travels. Everything you do is recorded in its audit log."),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toContainElement(screen.getByRole("button", { name: banners.stop }));
    expect(screen.getByRole("button", { name: banners.stop })).toBeVisible();
  });

  it("shows nothing for the member themselves, online, with the subscription paid", async () => {
    const { container } = await renderBanners(member());
    expect(container).toBeEmptyDOMElement();
  });

  it("says so while the device is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await renderBanners(member());
    expect(screen.getByRole("status")).toHaveTextContent(banners.offline);
  });

  it("says when the trial ends, in its last week only", async () => {
    await renderBanners(member(), subscription("trial", "full", { trialEndsOn: "2026-10-22" }));
    expect(screen.getByText("Trial ends 22 Oct")).toBeVisible();
    const { container } = await renderBanners(member(), subscription("trial", "full", { trialEndsOn: "2026-10-23" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("counts the trial's days in the organization's zone, not the device's or UTC's", async () => {
    // 15 Oct in UTC and in India, but already 16 Oct in Auckland: the trial's last week has begun there.
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const asha = member();
    const inAuckland = { ...asha, organization: { ...asha.organization, timeZone: "Pacific/Auckland" } };
    await renderBanners(inAuckland, subscription("trial", "full", { trialEndsOn: "2026-10-22" }));
    expect(screen.getByText("Trial ends 22 Oct")).toBeVisible();
    const { container } = await renderBanners(asha, subscription("trial", "full", { trialEndsOn: "2026-10-22" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("says payment is due, and the day the organization becomes read-only", async () => {
    await renderBanners(member(), subscription("past_due", "full", { nextChangeOn: "2026-10-22" }));
    expect(screen.getByText("Payment due. Read-only from 22 Oct")).toBeVisible();
  });

  it("says payment is due, with no day, when none is set for read-only", async () => {
    await renderBanners(member(), subscription("past_due", "full"));
    expect(screen.getByText(banner.pastDueUndated, { exact: true })).toBeVisible();
  });

  it("shows the subscription's state in the status colours: amber while payment is due, red while read-only", async () => {
    const { unmount } = await renderBanners(member(), subscription("past_due", "full"));
    expect(screen.getByText(banner.pastDueUndated).parentElement).toHaveClass(
      "bg-status-attention-fill",
      "text-status-attention-ink",
    );
    unmount();
    await renderBanners(member(), subscription("read_only", "read_only"));
    expect(screen.getByText(banner.readOnly).parentElement).toHaveClass("bg-status-bad-fill", "text-status-bad-ink");
  });

  it("gives the Owner, who pays, the way to contact support, and nobody else", async () => {
    const { unmount } = await renderBanners(member({ isOwner: true }), subscription("past_due", "full"));
    expect(screen.getByRole("link", { name: banner.contactSupport })).toHaveAttribute(
      "href",
      `mailto:${brand.supportEmail}`,
    );
    unmount();
    await renderBanners(member(), subscription("past_due", "full"));
    expect(screen.queryByRole("link", { name: banner.contactSupport })).toBeNull();
  });

  it("says a read-only organization can still view and export", async () => {
    await renderBanners(member({ isOwner: true }), subscription("read_only", "read_only"));
    expect(screen.getByText(banner.readOnly)).toBeVisible();
  });

  it("shows no subscription banner while the subscription can't be read", async () => {
    const { container } = await renderBanners(member(), "offline");
    expect(container).toBeEmptyDOMElement();
  });
});
