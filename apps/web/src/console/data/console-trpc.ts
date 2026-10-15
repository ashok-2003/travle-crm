// The console's tRPC client and its TanStack Query hooks (ADR 0019). The web app knows the console's procedures only
// by the PlatformRouter type; calls go to /api/platform/trpc on the address the app was loaded from, which reaches
// the console process (a rewrite in development, the load balancer when deployed), batched like the api's.
import type { PlatformRouter } from "@travel-crm/api/platform";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export const {
  TRPCProvider: ConsoleTRPCProvider,
  useTRPC: useConsoleTRPC,
  useTRPCClient: useConsoleTRPCClient,
} = createTRPCContext<PlatformRouter>();

export function createConsoleClient() {
  return createTRPCClient<PlatformRouter>({ links: [httpBatchLink({ url: "/api/platform/trpc" })] });
}

export type ConsoleClient = ReturnType<typeof createConsoleClient>;
