// A fake api for the organization hooks: every call the app makes waits until the test answers it, so a test can look
// at the screen "before the api answers", answer calls in any order, and refuse them with the api's own reasons. The
// query cache starts with a paid subscription, so the calls a test sees are only the ones it is about.
import type { AppRouter } from "@travel-crm/api";
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { createApiClient, TRPCProvider } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { member } from "../support/members";

export interface PendingCall {
  /** The procedure, e.g. "staff.updateRole". */
  path: string;
  input: unknown;
  answer: (data: unknown) => void;
  refuse: (status: number, reason: string) => void;
  /** The call never gets an answer, as when the device is offline. */
  fail: () => void;
}

export function fakeApi() {
  const calls: PendingCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: { body?: string }) => {
      const path = new URL(url, "http://localhost").pathname.replace("/api/trpc/", "");
      const body = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
      const json = (status: number, payload: unknown) =>
        new Response(JSON.stringify([payload]), { status, headers: { "content-type": "application/json" } });
      return new Promise<Response>((resolve, reject) => {
        calls.push({
          path,
          input: body["0"],
          answer: (data) => {
            resolve(json(200, { result: { data } }));
          },
          fail: () => {
            reject(new TypeError("Failed to fetch"));
          },
          refuse: (status, reason) => {
            resolve(
              json(status, {
                error: { message: reason, code: -32603, data: { code: "FORBIDDEN", httpStatus: status, reason } },
              }),
            );
          },
        });
      });
    }),
  );
  return {
    calls,
    last: () => {
      const call = calls.at(-1);
      if (!call) throw new Error("the app has made no call yet");
      return call;
    },
  };
}

/** subscription.get's answer for an organization that has paid: every change goes ahead. */
export const paidSubscription: SubscriptionOverview = {
  status: "active",
  access: "full",
  planName: "Growth",
  modules: [],
  trialEndsOn: null,
  paidThrough: "2027-10-15",
  nextChangeOn: "2027-10-16",
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1_000_000_000 },
};

/**
 * A query cache for these tests. The screens ask for the subscription before offering a change (useWriteAccess): it
 * holds `subscription`, never stale, so it is never asked for; null leaves it to the api like any other call.
 */
export function newQueryClient(subscription: SubscriptionOverview | null = paidSubscription) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  if (subscription) {
    const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
    queryClient.setQueryDefaults(trpc.subscription.get.queryKey(), { staleTime: Infinity });
    queryClient.setQueryData(trpc.subscription.get.queryKey(), subscription);
  }
  return queryClient;
}

/** The providers the app's hooks and screens need: messages, a query cache and the tRPC client. */
export function withApp(queryClient: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
        <QueryClientProvider client={queryClient}>
          <TRPCProvider trpcClient={createApiClient()} queryClient={queryClient}>
            {children}
          </TRPCProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  };
}

/** Renders a screen or dialog as a signed-in member sees it, with a query cache the test can look into. */
export function renderWithApi(ui: ReactNode, queryClient: QueryClient, me: SignedInMember = member({ isOwner: true })) {
  // Radix selects and dialogs ask for ResizeObserver, which jsdom lacks; nothing here depends on layout. Stubbed per
  // render because tests unstub their globals after each test, and only when the test brought none of its own (one
  // that plays the browser's resizes, as the lead page's sticky timeline needs).
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = () => undefined;
        unobserve = () => undefined;
        disconnect = () => undefined;
      },
    );
  }
  const Providers = withApp(queryClient);
  // As a wrapper, so a rerender keeps the providers.
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers>
        <MeProvider me={me}>{children}</MeProvider>
      </Providers>
    ),
  });
}
