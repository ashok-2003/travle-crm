// A button learns whether it may act from the subscription (useWriteAccess): allowed while subscription.get loads
// (the api decides), and otherwise refused with the sentence for the reason the api would give.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";
import { MeProvider } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";
import { useWriteAccess, type WriteKind } from "@/subscription/write-access";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

/** Says whether the subscription has loaded, and what the button would be. */
function Probe({ kind }: { kind?: WriteKind }) {
  const loaded = useSubscription().data !== undefined;
  const { allowed, hint } = useWriteAccess(kind);
  return <p>{`${loaded ? "loaded" : "loading"}, ${allowed ? "allowed" : `refused: ${hint ?? ""}`}`}</p>;
}

function renderProbe(probe: ReactNode, isOwner = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
          <MeProvider me={member({ isOwner })}>{probe}</MeProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const subscription = (access: string) => ({
  data: {
    status: "read_only",
    access,
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWriteAccess", () => {
  it("allows while the subscription loads", () => {
    stubApi({ "subscription.get": "never" });
    renderProbe(<Probe />);
    expect(screen.getByText("loading, allowed")).toBeVisible();
  });

  it("refuses a change in a read-only organization, saying why, and allows an export", async () => {
    stubApi({ "subscription.get": subscription("read_only") });
    renderProbe(
      <>
        <Probe />
        <Probe kind="export" />
      </>,
    );
    expect(await screen.findByText(`loaded, refused: ${messages.errors.reasons.ORGANIZATION_READ_ONLY}`)).toBeVisible();
    expect(screen.getByText("loaded, allowed")).toBeVisible();
  });

  it("lets an Owner remove staff while suspended, and nobody else", async () => {
    stubApi({ "subscription.get": subscription("export_only") });
    renderProbe(<Probe kind="revoke" />, true);
    renderProbe(<Probe kind="revoke" />, false);
    expect(await screen.findByText("loaded, allowed")).toBeVisible();
    expect(await screen.findByText(`loaded, refused: ${messages.errors.reasons.ORGANIZATION_SUSPENDED}`)).toBeVisible();
  });
});
