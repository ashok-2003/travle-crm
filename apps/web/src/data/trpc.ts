// The tRPC client and its TanStack Query hooks (spec 11). The web app knows the api only by its AppRouter type; calls
// go to /api/trpc on the address the app was loaded from (spec 3), batched, every one a JSON POST from the app's
// origin, which the api requires (it refuses other origins and content types). Queries too: as GETs their input
// (a phone number, a searched name) would sit in the URL, and so in access logs that no erasure reaches.
import type { AppRouter } from "@travel-crm/api";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export function createApiClient() {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc", methodOverride: "POST" })] });
}

export type ApiClient = ReturnType<typeof createApiClient>;
